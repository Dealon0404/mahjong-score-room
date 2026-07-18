const DEFAULT_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
const MAX_IMAGE_DATA_URL_LENGTH = 10 * 1024 * 1024;

const NUMBER_LABELS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const TILE_LABELS = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
  red: '紅中',
  green: '發財',
  white: '白板',
};

const TILE_ALIASES = {
  east: 'east',
  '1z': 'east',
  東: 'east',
  東風: 'east',
  dong: 'east',
  south: 'south',
  '2z': 'south',
  南: 'south',
  南風: 'south',
  nan: 'south',
  west: 'west',
  '3z': 'west',
  西: 'west',
  西風: 'west',
  xi: 'west',
  north: 'north',
  '4z': 'north',
  北: 'north',
  北風: 'north',
  bei: 'north',
  red: 'red',
  '7z': 'red',
  中: 'red',
  紅中: 'red',
  红中: 'red',
  chun: 'red',
  green: 'green',
  '6z': 'green',
  發: 'green',
  发: 'green',
  發財: 'green',
  发财: 'green',
  hatsu: 'green',
  white: 'white',
  '5z': 'white',
  白: 'white',
  白板: 'white',
  haku: 'white',
};

analyzeTiles.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

module.exports = analyzeTiles;

async function analyzeTiles(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.query?.health) {
    sendJson(res, 200, {
      ok: true,
      source: 'analyze-tiles',
      model: DEFAULT_MODEL,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST with JSON body, or GET ?health=1.' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, {
      error: 'OPENAI_API_KEY_MISSING',
      message: 'Set OPENAI_API_KEY on the server to enable real tile vision.',
    });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const image = String(body.image || '');
    const context = body.context || {};

    if (!image.startsWith('data:image/')) {
      sendJson(res, 400, { error: 'INVALID_IMAGE', message: 'Expected image as a data:image/* base64 data URL.' });
      return;
    }

    if (image.length > MAX_IMAGE_DATA_URL_LENGTH) {
      sendJson(res, 413, { error: 'IMAGE_TOO_LARGE', message: 'Image is too large. Try a clearer cropped photo.' });
      return;
    }

    const analysis = await callOpenAiVision(image, context);
    sendJson(res, 200, normalizeAnalysis(analysis));
  } catch (error) {
    sendJson(res, 500, {
      error: 'TILE_ANALYSIS_FAILED',
      message: error.message || 'Unable to analyze Mahjong tiles.',
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

async function callOpenAiVision(image, context) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.1,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a visual Mahjong tile reader for Hong Kong Mahjong photos.',
            'Your first priority is tile recognition: identify every visible tile, including duplicates, from left to right.',
            'Only after reading tiles should you estimate Hong Kong Mahjong fan.',
            'Return JSON only. Do not include markdown.',
            'Use Traditional Chinese / Cantonese for explanations.',
            'Use only the allowed tile codes. If a tile is genuinely unreadable, use code "unknown" with a warning.',
            'If a scoring item depends on hidden context that is not visible in the image, use the supplied context or add a warning instead of guessing.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildPrompt(context),
            },
            {
              type: 'image_url',
              image_url: { url: image, detail: 'high' },
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no analysis content.');
  return JSON.parse(content);
}

function buildPrompt(context) {
  return `
Analyze this Hong Kong Mahjong winning hand photo.

Context JSON:
${JSON.stringify(context, null, 2)}

Tile codes to use:
- 1m..9m = 萬子
- 1p..9p = 筒子
- 1s..9s = 索子/條子
- east, south, west, north, red, green, white = 字牌
- flower1..flower8 only if flowers are clearly shown
- unknown = visible tile exists but the face cannot be read

Visual reading rules:
- Read all visible tiles in photo order, left-to-right where possible. Keep duplicate tiles as separate array entries.
- A normal winning hand usually has 14 tiles excluding flowers; return the visible count even if the photo is cropped or has extra exposed melds.
- 萬子 have Chinese numerals plus 萬/万.
- 筒子 are circle/dot tiles.
- 索子/條子 are bamboo/stick tiles; 1索 can look like a bird.
- 字牌 are 東、南、西、北、中、發/发、白/blank white dragon.
- Do not invent hidden tiles. If the face is blocked, glare-covered, too small, or angled, use unknown and explain.

Return this exact JSON shape:
{
  "source": "openai-vision",
  "confidence": "high | medium | low",
  "tiles": [{ "code": "1m", "label": "一萬", "confidence": "high", "position": 1 }],
  "tileCount": 14,
  "patterns": [{ "name": "清一色", "faan": 7, "reason": "全副牌都係同一門數牌" }],
  "faan": 0,
  "reasons": ["點解係呢個番數"],
  "warnings": ["有咩位唔肯定"]
}

Fan-counting guidance:
- Estimate raw fan before table cap, clamp to 0-13.
- Add 自摸 only when context.winType is 自摸 or 包自摸.
- Do not claim 門清 if exposed melds cannot be determined from the photo; add warning.
- Consider common Hong Kong patterns when visible: 平糊, 對對糊, 混一色, 清一色, 小三元, 大三元, 字一色, 清么九, 混么九, 七對子, 十三么.
- Consider round wind and seat wind only when matching triplets/quads are visible and context has roundWind/winnerSeat.
- If tiles are unclear, still return best-effort tiles and fan, but lower confidence and explain what needs manual confirmation.
`.trim();
}

function normalizeAnalysis(data) {
  const tiles = Array.isArray(data.tiles) ? data.tiles.map(normalizeTileEntry).filter(Boolean) : [];
  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean).map(String) : [];
  const faan = clampFaan(data.faan ?? patterns.reduce((sum, pattern) => sum + Number(pattern.faan || 0), 0));
  if (!tiles.length) warnings.push('AI 未能可靠讀到牌面，請用較近、較正面、少反光嘅相再試。');

  return {
    source: data.source || 'openai-vision',
    confidence: normalizeConfidence(data.confidence),
    tiles,
    tileCount: Number(data.tileCount || tiles.length) || tiles.length,
    patterns,
    faan,
    reasons: reasons.length ? reasons : patterns.map((pattern) => `${pattern.name || '牌型'}：${pattern.reason || `${pattern.faan || 0}番`}`),
    warnings,
  };
}

function normalizeTileEntry(tile, index) {
  if (typeof tile === 'string') {
    const code = normalizeTileCode(tile);
    return { code: code || 'unknown', label: code ? tileLabel(code) : tile, confidence: 'medium', position: index + 1 };
  }

  if (!tile || typeof tile !== 'object') return null;
  const code = normalizeTileCode(tile.code || tile.tile || tile.name || tile.label) || normalizeTileCode(tile.label) || 'unknown';
  const label = code === 'unknown' ? String(tile.label || tile.name || '未知').trim() || '未知' : tileLabel(code);
  const position = Number(tile.position || tile.index || index + 1);
  return {
    code,
    label,
    confidence: normalizeConfidence(tile.confidence),
    position: Number.isFinite(position) ? position : index + 1,
  };
}

function normalizeTileCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (/^[1-9][mps]$/.test(compact)) return compact;
  if (/^flower[1-8]$/.test(compact)) return compact;
  if (TILE_ALIASES[raw] || TILE_ALIASES[compact]) return TILE_ALIASES[raw] || TILE_ALIASES[compact];

  const suitMatch = raw.match(/^([一二三四五六七八九1-9])\s*([萬万筒餅饼索條条竹])$/);
  if (suitMatch) {
    const number = chineseNumberValue(suitMatch[1]);
    const suit = suitCode(suitMatch[2]);
    if (number && suit) return `${number}${suit}`;
  }

  const englishSuitMatch = compact.match(/^(?:([1-9])(man|wan|character|characters|dot|dots|pin|tong|circle|bamboo|bamboos|sou|sok)|(?:man|wan|character|characters|dot|dots|pin|tong|circle|bamboo|bamboos|sou|sok)([1-9]))$/);
  if (englishSuitMatch) {
    const number = englishSuitMatch[1] || englishSuitMatch[3];
    const word = englishSuitMatch[2] || compact.replace(number, '');
    const suit = word.includes('man') || word.includes('wan') || word.includes('character') ? 'm' : word.includes('dot') || word.includes('pin') || word.includes('tong') || word.includes('circle') ? 'p' : 's';
    return `${number}${suit}`;
  }

  return compact === 'unknown' || raw === '未知' ? 'unknown' : '';
}

function chineseNumberValue(value) {
  const numeric = Number(value);
  if (numeric >= 1 && numeric <= 9) return numeric;
  return NUMBER_LABELS.indexOf(value);
}

function suitCode(value) {
  if (value === '萬' || value === '万') return 'm';
  if (value === '筒' || value === '餅' || value === '饼') return 'p';
  if (value === '索' || value === '條' || value === '条' || value === '竹') return 's';
  return '';
}

function tileLabel(code) {
  if (TILE_LABELS[code]) return TILE_LABELS[code];
  if (code === 'unknown') return '未知';
  if (code.startsWith('flower')) return `花牌${code.slice(6)}`;
  if (/^[1-9][mps]$/.test(code)) {
    const suit = code[1] === 'm' ? '萬' : code[1] === 'p' ? '筒' : '索';
    return `${NUMBER_LABELS[Number(code[0])]}${suit}`;
  }
  return code;
}

function normalizeConfidence(value) {
  const confidence = String(value || '').trim().toLowerCase();
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') return confidence;
  if (confidence.includes('高')) return 'high';
  if (confidence.includes('低')) return 'low';
  return 'medium';
}

function clampFaan(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(13, Math.round(number)));
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