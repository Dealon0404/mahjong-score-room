const ROOM_TTL_SECONDS = Number(process.env.LIVE_ROOM_TTL_SECONDS || 60 * 60 * 24);
const MAX_ROOM_ID_LENGTH = 16;

const memoryRooms = globalThis.__mahjongLiveRooms || new Map();
globalThis.__mahjongLiveRooms = memoryRooms;

liveRoom.config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

module.exports = liveRoom;

async function liveRoom(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      await handleGet(req, res);
      return;
    }

    if (req.method === 'POST') {
      await handlePost(req, res);
      return;
    }

    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST.' });
  } catch (error) {
    sendJson(res, 500, {
      error: 'LIVE_ROOM_FAILED',
      message: error.message || 'Unable to sync Mahjong room.',
    });
  }
}

async function handleGet(req, res) {
  if (req.query?.health) {
    sendJson(res, 200, {
      ok: true,
      source: 'live-room',
      storage: storageMode(),
      persistent: hasUpstash(),
      ttlSeconds: ROOM_TTL_SECONDS,
    });
    return;
  }

  const roomId = normalizeRoomId(req.query?.room || req.query?.id);
  if (!roomId) {
    sendJson(res, 400, { error: 'ROOM_REQUIRED', message: 'Missing room id.' });
    return;
  }

  const snapshot = await getStoredRoom(roomId);
  if (!snapshot) {
    sendJson(res, 404, { error: 'ROOM_NOT_FOUND', message: 'This live room is not online yet.' });
    return;
  }

  const since = Number(req.query?.since || 0);
  if (since && Number(snapshot.revision || 0) <= since) {
    sendJson(res, 200, {
      roomId,
      notModified: true,
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      storage: storageMode(),
    });
    return;
  }

  sendJson(res, 200, { ...snapshot, storage: storageMode() });
}

async function handlePost(req, res) {
  const body = await readJsonBody(req);
  const roomId = normalizeRoomId(body.roomId || body.id || body.state?.room?.id);
  if (!roomId) {
    sendJson(res, 400, { error: 'ROOM_REQUIRED', message: 'Missing room id.' });
    return;
  }

  const state = normalizeState(body.state);
  if (!state) {
    sendJson(res, 400, { error: 'STATE_REQUIRED', message: 'Missing room state.' });
    return;
  }

  const current = await getStoredRoom(roomId);
  const currentRevision = Number(current?.revision || 0);
  const revision = Math.max(Date.now(), currentRevision + 1);
  const snapshot = {
    roomId,
    revision,
    updatedAt: new Date().toISOString(),
    updatedBy: String(body.clientId || '').slice(0, 80),
    state,
  };

  await setStoredRoom(roomId, snapshot);
  sendJson(res, 200, { ...snapshot, storage: storageMode() });
}

function normalizeRoomId(value) {
  const roomId = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(roomId) || roomId.length > MAX_ROOM_ID_LENGTH) return '';
  return roomId;
}

function normalizeState(state) {
  if (!state || typeof state !== 'object' || !state.room || typeof state.room !== 'object') return null;
  return {
    room: state.room,
    rounds: Array.isArray(state.rounds) ? state.rounds : [],
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function getStoredRoom(roomId) {
  if (hasUpstash()) {
    const result = await upstashCommand(['GET', roomKey(roomId)]);
    return result ? JSON.parse(result) : null;
  }
  return memoryRooms.get(roomId) || null;
}

async function setStoredRoom(roomId, snapshot) {
  if (hasUpstash()) {
    await upstashCommand(['SET', roomKey(roomId), JSON.stringify(snapshot), 'EX', ROOM_TTL_SECONDS]);
    return;
  }
  memoryRooms.set(roomId, snapshot);
}

function roomKey(roomId) {
  return `mahjong-room:${roomId}`;
}

function hasUpstash() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function storageMode() {
  return hasUpstash() ? 'upstash-redis' : 'memory-dev';
}

async function upstashCommand(command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Upstash HTTP ${response.status}`);
  }
  return payload.result;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}