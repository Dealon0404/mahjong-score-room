const { put } = require('@vercel/blob');

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const CONSENT_VERSION = 'mahjong-tile-training-v1';

trainingSamples.config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

module.exports = trainingSamples;

async function trainingSamples(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.query?.health) {
    sendJson(res, 200, {
      ok: true,
      source: 'training-samples',
      storage: 'vercel-blob',
      configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      consentVersion: CONSENT_VERSION,
      maxImageBytes: MAX_IMAGE_BYTES,
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Use POST with JSON body, or GET ?health=1.' });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendJson(res, 503, {
      error: 'BLOB_TOKEN_MISSING',
      message: 'Set BLOB_READ_WRITE_TOKEN on Vercel to collect opt-in training samples.',
    });
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (body.consent !== true) {
      sendJson(res, 400, { error: 'CONSENT_REQUIRED', message: 'Training samples require explicit user consent.' });
      return;
    }

    const image = parseImageDataUrl(body.image);
    if (!image) {
      sendJson(res, 400, { error: 'INVALID_IMAGE', message: 'Expected image as a data:image/* base64 data URL.' });
      return;
    }

    if (image.buffer.byteLength > MAX_IMAGE_BYTES) {
      sendJson(res, 413, { error: 'IMAGE_TOO_LARGE', message: 'Training image is too large.' });
      return;
    }

    const now = new Date();
    const sampleId = makeSampleId(now);
    const day = now.toISOString().slice(0, 10);
    const prefix = `mahjong-training/${day}/${sampleId}`;
    const imagePath = `${prefix}.${image.extension}`;
    const metadataPath = `${prefix}.json`;

    const imageBlob = await put(imagePath, image.buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: image.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const metadata = {
      sampleId,
      createdAt: now.toISOString(),
      consentVersion: CONSENT_VERSION,
      source: 'mahjong-score-room-pwa',
      image: {
        url: imageBlob.url,
        pathname: imageBlob.pathname,
        contentType: image.contentType,
        byteLength: image.buffer.byteLength,
      },
      app: sanitizeAppMetadata(body.app),
      context: sanitizeContext(body.context),
      analysis: sanitizeAnalysis(body.analysis),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    };

    const metadataBlob = await put(metadataPath, JSON.stringify(metadata, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json; charset=utf-8',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    sendJson(res, 200, {
      ok: true,
      sampleId,
      consentVersion: CONSENT_VERSION,
      imagePath: imageBlob.pathname,
      metadataPath: metadataBlob.pathname,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'TRAINING_SAMPLE_FAILED',
      message: error.message || 'Unable to save training sample.',
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

function parseImageDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  return {
    contentType,
    extension,
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function makeSampleId(now) {
  return `${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeAppMetadata(value) {
  const app = value && typeof value === 'object' ? value : {};
  return {
    roomId: String(app.roomId || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16),
    version: String(app.version || '').slice(0, 40),
  };
}

function sanitizeContext(value) {
  const context = value && typeof value === 'object' ? value : {};
  return {
    tableSetting: context.tableSetting || null,
    winType: String(context.winType || '').slice(0, 20),
    currentFaan: Number(context.currentFaan || 0),
    roundWind: String(context.roundWind || '').slice(0, 5),
    dealerSeat: String(context.dealerSeat || '').slice(0, 5),
    winnerSeat: String(context.winnerSeat || '').slice(0, 5),
  };
}

function sanitizeAnalysis(value) {
  const analysis = value && typeof value === 'object' ? value : {};
  return {
    source: String(analysis.source || '').slice(0, 80),
    confidence: String(analysis.confidence || '').slice(0, 20),
    faan: Number(analysis.faan || 0),
    tiles: Array.isArray(analysis.tiles) ? analysis.tiles.map(sanitizeTile).filter(Boolean).slice(0, 80) : [],
    patterns: Array.isArray(analysis.patterns) ? analysis.patterns.map(sanitizePattern).filter(Boolean).slice(0, 30) : [],
    warnings: Array.isArray(analysis.warnings) ? analysis.warnings.map((item) => String(item).slice(0, 240)).slice(0, 20) : [],
  };
}

function sanitizeTile(tile) {
  if (!tile) return null;
  if (typeof tile === 'string') return { label: tile.slice(0, 40) };
  return {
    code: String(tile.code || '').slice(0, 20),
    label: String(tile.label || tile.name || '').slice(0, 40),
    confidence: String(tile.confidence || '').slice(0, 20),
    position: Number(tile.position || 0) || undefined,
  };
}

function sanitizePattern(pattern) {
  if (!pattern || typeof pattern !== 'object') return null;
  return {
    name: String(pattern.name || '').slice(0, 40),
    faan: Number(pattern.faan || 0),
    reason: String(pattern.reason || '').slice(0, 240),
  };
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