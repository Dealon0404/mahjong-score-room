const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const ort = require('onnxruntime-node');

const IMAGE_SIZE = Number(process.env.MAHJONG_YOLO_IMAGE_SIZE || 512);
const CONFIDENCE = Number(process.env.MAHJONG_YOLO_CONFIDENCE || 0.25);
const IOU = Number(process.env.MAHJONG_YOLO_IOU || 0.5);
const MAX_IMAGE_DATA_URL_LENGTH = 10 * 1024 * 1024;
const MODEL_DIR = path.join(__dirname, 'models', 'open-seed-expanded');
const MODEL_PATH = path.join(MODEL_DIR, 'best.onnx');
const CLASSES_PATH = path.join(MODEL_DIR, 'classes.txt');
const MIN_WINNING_TILES = 14;
const MAX_WINNING_TILES = 18;

const NUMBER_LABELS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const DRAGONS = new Set(['red', 'green', 'white']);
const WINDS = new Set(['east', 'south', 'west', 'north']);
const TERMINALS_AND_HONORS = new Set(['1m', '9m', '1p', '9p', '1s', '9s', 'east', 'south', 'west', 'north', 'red', 'green', 'white']);
const SEAT_MAP = { 東: 'east', 南: 'south', 西: 'west', 北: 'north' };
const HONOR_LABELS = { east: '東', south: '南', west: '西', north: '北', red: '中', green: '發', white: '白' };

let sessionPromise = null;
let classesCache = null;

analyzeTilesYolo.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

module.exports = analyzeTilesYolo;

async function analyzeTilesYolo(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.query?.health) {
    sendJson(res, 200, {
      ok: true,
      source: 'yolo-onnx',
      modelConfigured: fs.existsSync(MODEL_PATH) && fs.existsSync(CLASSES_PATH),
      imageSize: IMAGE_SIZE,
      confidence: CONFIDENCE,
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST with JSON body, or GET ?health=1.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const imageDataUrl = String(body.image || '');
    const context = body.context && typeof body.context === 'object' ? body.context : {};

    if (!imageDataUrl.startsWith('data:image/')) {
      sendJson(res, 400, { error: 'INVALID_IMAGE', message: 'Expected image as a data:image/* base64 data URL.' });
      return;
    }
    if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      sendJson(res, 413, { error: 'IMAGE_TOO_LARGE', message: 'Image is too large. Try a clearer cropped photo.' });
      return;
    }

    const image = decodeJpegDataUrl(imageDataUrl);
    const detections = await detectTiles(image);
    const winningHand = selectWinningHandDetections(detections);
    const tileCodes = winningHand.map((item) => item.code).filter(Boolean);
    const scoring = scoreHongKongHand(tileCodes, context);

    sendJson(res, 200, {
      ...scoring,
      source: 'yolo-onnx',
      tiles: winningHand.map((item, index) => ({
        code: item.code,
        label: tileLabel(item.code),
        confidence: confidenceLabel(item.confidence),
        position: index + 1,
        box: item.box,
        rawLabel: item.rawLabel,
      })),
      tileCount: winningHand.length,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'YOLO_TILE_ANALYSIS_FAILED',
      message: error.message || 'Unable to analyze Mahjong tiles with local YOLO model.',
    });
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function decodeJpegDataUrl(dataUrl) {
  const [header, encoded] = dataUrl.split(',', 2);
  if (!encoded) throw new Error('Invalid image data URL.');
  if (!/^data:image\/jpe?g/i.test(header)) throw new Error('YOLO endpoint expects JPEG input.');
  const decoded = jpeg.decode(Buffer.from(encoded, 'base64'), { useTArray: true });
  if (!decoded || !decoded.width || !decoded.height || !decoded.data) throw new Error('Unable to decode JPEG image.');
  return decoded;
}

async function detectTiles(image) {
  const session = await getSession();
  const classes = getClasses();
  const input = preprocess(image);
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input.data, [1, 3, IMAGE_SIZE, IMAGE_SIZE]) };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  const rows = yoloRows(output.data, output.dims);
  const detections = [];

  for (const row of rows) {
    let classId = 0;
    let score = -Infinity;
    for (let index = 4; index < row.length; index += 1) {
      if (row[index] > score) {
        score = row[index];
        classId = index - 4;
      }
    }
    if (score < CONFIDENCE) continue;
    const [cx, cy, width, height] = row;
    const left = clamp((cx - width / 2 - input.padX) / input.scale, 0, image.width);
    const top = clamp((cy - height / 2 - input.padY) / input.scale, 0, image.height);
    const boxWidth = clamp(width / input.scale, 0, image.width - left);
    const boxHeight = clamp(height / input.scale, 0, image.height - top);
    const rawLabel = classes[classId] || String(classId);
    const code = normalizeTileCode(rawLabel);
    if (!code) continue;
    detections.push({
      code,
      rawLabel,
      confidence: score,
      box: [left / image.width, top / image.height, boxWidth / image.width, boxHeight / image.height],
    });
  }

  return nms(detections);
}

function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'] });
  }
  return sessionPromise;
}

function getClasses() {
  if (!classesCache) {
    classesCache = fs.readFileSync(CLASSES_PATH, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  return classesCache;
}

function preprocess(image) {
  const scale = Math.min(IMAGE_SIZE / image.width, IMAGE_SIZE / image.height);
  const resizedWidth = Math.max(1, Math.round(image.width * scale));
  const resizedHeight = Math.max(1, Math.round(image.height * scale));
  const padX = Math.floor((IMAGE_SIZE - resizedWidth) / 2);
  const padY = Math.floor((IMAGE_SIZE - resizedHeight) / 2);
  const data = new Float32Array(3 * IMAGE_SIZE * IMAGE_SIZE);
  const plane = IMAGE_SIZE * IMAGE_SIZE;

  for (let y = 0; y < resizedHeight; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < resizedWidth; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const targetIndex = (padY + y) * IMAGE_SIZE + padX + x;
      data[targetIndex] = image.data[sourceIndex] / 255;
      data[plane + targetIndex] = image.data[sourceIndex + 1] / 255;
      data[2 * plane + targetIndex] = image.data[sourceIndex + 2] / 255;
    }
  }

  return { data, scale, padX, padY };
}

function yoloRows(data, dims) {
  const output = Array.from(data);
  if (dims.length === 3) {
    const channels = dims[1];
    const anchors = dims[2];
    if (channels < anchors) {
      return Array.from({ length: anchors }, (_, anchor) => Array.from({ length: channels }, (_, channel) => output[channel * anchors + anchor]));
    }
    return Array.from({ length: channels }, (_, row) => output.slice(row * anchors, row * anchors + anchors));
  }
  return [];
}

function nms(detections) {
  const selected = [];
  for (const detection of detections.sort((a, b) => b.confidence - a.confidence)) {
    if (selected.every((item) => iou(detection.box, item.box) <= IOU)) selected.push(detection);
  }
  return selected;
}

function iou(first, second) {
  const [ax1, ay1, aw, ah] = first;
  const [bx1, by1, bw, bh] = second;
  const ax2 = ax1 + aw;
  const ay2 = ay1 + ah;
  const bx2 = bx1 + bw;
  const by2 = by1 + bh;
  const interW = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const interH = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const intersection = interW * interH;
  const union = aw * ah + bw * bh - intersection;
  return union ? intersection / union : 0;
}

function selectWinningHandDetections(detections) {
  const tiles = detections.filter((item) => item.code);
  if (tiles.length <= MAX_WINNING_TILES) return tiles.sort((a, b) => centerX(a) - centerX(b));

  let candidates = candidateLowerHalf(tiles);
  if (candidates.length < MIN_WINNING_TILES) candidates = tiles.slice();

  let fitted = fitLineInliers(candidates);
  if (fitted.length < MIN_WINNING_TILES) fitted = candidates;

  fitted = fitted.sort((a, b) => centerX(a) - centerX(b));
  if (fitted.length > MAX_WINNING_TILES) {
    fitted = fitted
      .sort((a, b) => lineError(a, fitted) - lineError(b, fitted) || b.confidence - a.confidence)
      .slice(0, MAX_WINNING_TILES)
      .sort((a, b) => centerX(a) - centerX(b));
  }
  return fitted;
}

function candidateLowerHalf(detections) {
  for (const threshold of [0.5, 0.35, 0]) {
    const filtered = detections.filter((item) => centerY(item) >= threshold);
    if (filtered.length >= MIN_WINNING_TILES) return filtered;
  }
  return detections;
}

function fitLineInliers(detections) {
  const active = detections.slice();
  while (active.length > MAX_WINNING_TILES) {
    const [slope, intercept] = leastSquaresLine(active);
    const worst = active.reduce((current, item) => Math.abs(centerY(item) - (slope * centerX(item) + intercept)) > Math.abs(centerY(current) - (slope * centerX(current) + intercept)) ? item : current, active[0]);
    active.splice(active.indexOf(worst), 1);
  }
  const [slope, intercept] = leastSquaresLine(active);
  const errors = active.map((item) => Math.abs(centerY(item) - (slope * centerX(item) + intercept)));
  const threshold = Math.max(0.035, (errors.reduce((sum, value) => sum + value, 0) / (errors.length || 1)) * 2.4);
  return active.filter((item) => Math.abs(centerY(item) - (slope * centerX(item) + intercept)) <= threshold);
}

function leastSquaresLine(detections) {
  const xs = detections.map(centerX);
  const ys = detections.map(centerY);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denom = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!denom) return [0, meanY];
  const slope = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denom;
  return [slope, meanY - slope * meanX];
}

function lineError(item, group) {
  const [slope, intercept] = leastSquaresLine(group);
  return Math.abs(centerY(item) - (slope * centerX(item) + intercept));
}

function centerX(item) {
  return Number(item.box[0]) + Number(item.box[2]) / 2;
}

function centerY(item) {
  return Number(item.box[1]) + Number(item.box[3]) / 2;
}

function scoreHongKongHand(tileCodes, context = {}) {
  const cleanCodes = tileCodes.filter((code) => code && !code.startsWith('flower'));
  const counts = countTiles(cleanCodes);
  const patterns = [];
  const warnings = [];

  if (cleanCodes.length < 14) warnings.push(`只認到 ${cleanCodes.length} 隻牌，未夠 14 隻；番數只可當初步估計。`);
  else if (cleanCodes.length > 18) warnings.push(`認到 ${cleanCodes.length} 隻牌，可能包含其他玩家/棄牌；已用相片中最似食糊手牌嗰行。`);

  const partition = findStandardPartition(new Map(counts));
  const isSevenPairs = cleanCodes.length === 14 && Array.from(counts.values()).filter((count) => count === 2).length === 7;
  const isThirteenOrphans = cleanCodes.length === 14 && Array.from(TERMINALS_AND_HONORS).every((code) => counts.get(code)) && Array.from(TERMINALS_AND_HONORS).some((code) => counts.get(code) >= 2);

  if (isThirteenOrphans) addPattern(patterns, '十三么', 13, '十三隻么九字牌齊，再加其中一對。');
  else if (cleanCodes.length >= 14 && cleanCodes.every((code) => WINDS.has(code) || DRAGONS.has(code))) addPattern(patterns, '字一色', 10, '全副牌都係風牌或三元牌。');
  else {
    if (isSevenPairs) addPattern(patterns, '七對子', 4, '14 隻牌組成 7 對。');
    if (partition) scorePartitionPatterns(patterns, partition, counts, context);
    else warnings.push('未能穩定拆成 4 組牌加 1 對眼；請手動確認番型。');
    scoreColorPatterns(patterns, cleanCodes);
  }

  if (context.winType === '自摸' || context.winType === '包自摸') addPattern(patterns, '自摸', 1, '今鋪食糊方式係自摸。');
  const faan = Math.min(13, patterns.reduce((sum, pattern) => sum + Number(pattern.faan || 0), 0));
  if (!patterns.length) warnings.push('未認到明確番型；請用手動番數作最後確認。');

  return {
    confidence: cleanCodes.length >= 14 && !warnings.length ? 'medium' : cleanCodes.length >= 14 ? 'low' : '待確認',
    faan,
    patterns,
    reasons: patterns.length ? patterns.map((pattern) => `${pattern.name}：${pattern.reason}`) : ['暫時未能由相片穩定推斷番型。'],
    warnings,
  };
}

function countTiles(codes) {
  const counts = new Map();
  for (const code of codes) counts.set(code, (counts.get(code) || 0) + 1);
  return counts;
}

function findStandardPartition(counts) {
  for (const [pairCode, count] of Array.from(counts.entries())) {
    if (count < 2) continue;
    counts.set(pairCode, count - 2);
    const sets = extractSets(counts);
    counts.set(pairCode, count);
    if (sets) return { pair: pairCode, sets };
  }
  return null;
}

function extractSets(counts) {
  const remaining = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (remaining === 0) return [];
  const code = Array.from(counts.entries()).filter(([, count]) => count > 0).sort((a, b) => tileSortKey(a[0]) - tileSortKey(b[0]))[0]?.[0];
  if (!code) return [];

  if ((counts.get(code) || 0) >= 3) {
    counts.set(code, counts.get(code) - 3);
    const rest = extractSets(counts);
    counts.set(code, counts.get(code) + 3);
    if (rest) return [{ type: 'triplet', tiles: [code, code, code] }, ...rest];
  }

  const sequence = sequenceFrom(code);
  if (sequence && sequence.every((item) => (counts.get(item) || 0) > 0)) {
    sequence.forEach((item) => counts.set(item, counts.get(item) - 1));
    const rest = extractSets(counts);
    sequence.forEach((item) => counts.set(item, counts.get(item) + 1));
    if (rest) return [{ type: 'sequence', tiles: sequence }, ...rest];
  }

  return null;
}

function sequenceFrom(code) {
  if (!/^[1-9][mps]$/.test(code)) return null;
  const value = Number(code[0]);
  if (value > 7) return null;
  return [`${value}${code[1]}`, `${value + 1}${code[1]}`, `${value + 2}${code[1]}`];
}

function scorePartitionPatterns(patterns, partition, counts, context) {
  const sets = partition.sets;
  if (sets.length && sets.every((item) => item.type === 'triplet')) addPattern(patterns, '對對糊', 3, '四組牌都係刻子/槓子。');
  if (sets.length && sets.every((item) => item.type === 'sequence') && !DRAGONS.has(partition.pair) && !WINDS.has(partition.pair)) addPattern(patterns, '平糊', 1, '四組順子加一對非字牌眼。');

  const dragonTriplets = new Set(sets.filter((item) => item.type === 'triplet' && DRAGONS.has(item.tiles[0])).map((item) => item.tiles[0]));
  if (dragonTriplets.size === 3) addPattern(patterns, '大三元', 8, '中、發、白三副都係刻子/槓子。');
  else if (dragonTriplets.size === 2 && DRAGONS.has(partition.pair) && !dragonTriplets.has(partition.pair)) addPattern(patterns, '小三元', 5, '中、發、白其中兩副刻子，餘下一款做眼。');

  for (const [windLabel, patternName] of [[context.roundWind, '圈風'], [context.winnerSeat, '門風']]) {
    const windCode = SEAT_MAP[String(windLabel || '')] || '';
    if (windCode && (counts.get(windCode) || 0) >= 3) addPattern(patterns, patternName, 1, `有 ${tileLabel(windCode)} 風刻子。`);
  }
}

function scoreColorPatterns(patterns, codes) {
  const suits = new Set(codes.filter((code) => /^[1-9][mps]$/.test(code)).map((code) => code[1]));
  const hasHonor = codes.some((code) => WINDS.has(code) || DRAGONS.has(code));
  if (suits.size === 1 && !hasHonor) addPattern(patterns, '清一色', 7, '全副牌都係同一門數牌，無字牌。');
  else if (suits.size === 1 && hasHonor) addPattern(patterns, '混一色', 3, '一門數牌加字牌。');
}

function addPattern(patterns, name, faan, reason) {
  if (!patterns.some((pattern) => pattern.name === name)) patterns.push({ name, faan, reason });
}

function normalizeTileCode(rawLabel) {
  return String(rawLabel || '').trim().toLowerCase();
}

function tileLabel(code) {
  if (HONOR_LABELS[code]) return HONOR_LABELS[code];
  if (code.startsWith('flower')) return `花牌${code.slice(6)}`;
  if (/^[1-9][mps]$/.test(code)) return `${code[0]}${code[1] === 'm' ? '萬' : code[1] === 'p' ? '筒' : '索'}`;
  return code || '未知';
}

function tileSortKey(code) {
  if (/^[1-9][mps]$/.test(code)) return { m: 0, p: 20, s: 40 }[code[1]] + Number(code[0]);
  return ({ east: 61, south: 62, west: 63, north: 64, white: 65, green: 66, red: 67 }[code] || 99);
}

function confidenceLabel(value) {
  if (value >= 0.75) return 'high';
  if (value >= 0.45) return 'medium';
  return 'low';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
