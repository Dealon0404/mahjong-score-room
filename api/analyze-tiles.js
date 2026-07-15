const DEFAULT_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const MAX_IMAGE_DATA_URL_LENGTH = 10 * 1024 * 1024;

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

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST with JSON body.' });
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
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a Hong Kong Mahjong tile recognition and fan-count assistant.',
            'Inspect the winning hand photo, identify visible tiles, and estimate Hong Kong Mahjong fan.',
            'Return JSON only. Do not include markdown.',
            'Use Traditional Chinese / Cantonese for explanations.',
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

Return this exact JSON shape:
{
  "source": "openai-vision",
  "confidence": "high | medium | low",
  "tiles": [{ "code": "1m", "label": "一萬", "confidence": "high" }],
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
  const tiles = Array.isArray(data.tiles) ? data.tiles : [];
  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const faan = clampFaan(data.faan ?? patterns.reduce((sum, pattern) => sum + Number(pattern.faan || 0), 0));

  return {
    source: data.source || 'openai-vision',
    confidence: data.confidence || 'medium',
    tiles,
    patterns,
    faan,
    reasons: reasons.length ? reasons : patterns.map((pattern) => `${pattern.name || '牌型'}：${pattern.reason || `${pattern.faan || 0}番`}`),
    warnings,
  };
}

function clampFaan(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(13, Math.round(number)));
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}