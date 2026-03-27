const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
app.use(cors({ origin: '*' }));
app.use(express.json());

// rooms: { id, movieTitle, members: Map<ws, {role,username}>, state }
const rooms   = new Map();
const wsRoom  = new Map(); // ws -> roomId
const wsMeta  = new Map(); // ws -> { username }

app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

app.post('/room/create', (req, res) => {
  const { movieTitle } = req.body;
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  rooms.set(roomId, {
    id: roomId,
    movieTitle: movieTitle || 'Movie Night',
    members: new Map(),   // ws -> { username }
    state: { playing: false, position: 0, updatedAt: Date.now(), updatedBy: null },
  });
  console.log(`[+] Room ${roomId} — ${movieTitle}`);
  res.json({ roomId });
});

app.get('/room/:id', (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    roomId: room.id, movieTitle: room.movieTitle,
    memberCount: room.members.size, state: room.state,
  });
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  send(ws, { type: 'CONNECTED', clientId: ws.id });
  ws.on('message', (raw) => { try { handle(ws, JSON.parse(raw)); } catch (e) {} });
  ws.on('close',   () => disconnect(ws));
  ws.on('error',   () => {});
});

function handle(ws, msg) {
  const { type, roomId: rawId, ...payload } = msg;

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (type === 'JOIN') {
    const id   = rawId?.toUpperCase();
    const room = rooms.get(id);
    if (!room) return send(ws, { type: 'ERROR', message: 'Room not found' });

    const isFirst = room.members.size === 0;
    const role    = isFirst ? 'host' : 'guest';
    room.members.set(ws, { username: payload.username || role });
    wsRoom.set(ws, id);
    wsMeta.set(ws, { username: payload.username || role });

    send(ws, { type: 'JOINED', role, roomId: id, movieTitle: room.movieTitle, state: room.state });

    // Notify existing members
    broadcast(room, { type: 'PEER_JOINED', username: payload.username || role, memberCount: room.members.size }, ws);
    console.log(`[${id}] ${payload.username} joined (${room.members.size} total)`);
    return;
  }

  const room = rooms.get(wsRoom.get(ws));
  if (!room) return;
  const meta = room.members.get(ws);
  const username = meta?.username || '?';

  // ── PLAY / PAUSE / SEEK — anyone can trigger, relay to all others ─────────
  if (['PLAY', 'PAUSE', 'SEEK'].includes(type)) {
    const position = payload.position ?? 0;

    room.state = {
      playing:   type === 'PLAY',
      position,
      updatedAt: Date.now(),
      updatedBy: username,
    };

    const out = { PLAY: 'SYNC_PLAY', PAUSE: 'SYNC_PAUSE', SEEK: 'SYNC_SEEK' }[type];
    broadcast(room, { type: out, position, serverTime: Date.now(), username }, ws);
    return;
  }

  // ── RESYNC — sender shares their position, others snap to it ─────────────
  if (type === 'RESYNC') {
    const position = payload.position ?? 0;
    room.state = { playing: room.state.playing, position, updatedAt: Date.now(), updatedBy: username };
    broadcast(room, { type: 'SYNC_RESYNC', position, serverTime: Date.now(), username });
    // broadcast to ALL including sender so sender also confirms
    return;
  }

  // ── BUFFER events ──────────────────────────────────────────────────────────
  if (type === 'BUFFER_START') {
    broadcast(room, { type: 'SYNC_WAIT', username }, ws);
    return;
  }
  if (type === 'BUFFER_END') {
    broadcast(room, { type: 'SYNC_RESUME', username }, ws);
    return;
  }

  // ── POSITION_PING — periodic position report for auto-resync ─────────────
  if (type === 'POSITION_PING') {
    // Store per-member position for the server-side drift checker
    if (meta) meta.position = payload.position;
    return;
  }
}

function disconnect(ws) {
  const roomId = wsRoom.get(ws);
  wsRoom.delete(ws); wsMeta.delete(ws);
  const room = rooms.get(roomId);
  if (!room) return;
  const meta = room.members.get(ws);
  room.members.delete(ws);
  if (room.members.size === 0) {
    rooms.delete(roomId);
    console.log(`[x] Room ${roomId} closed`);
    return;
  }
  broadcast(room, { type: 'PEER_LEFT', username: meta?.username || '?', memberCount: room.members.size });
  console.log(`[-] ${meta?.username} left room ${roomId}`);
}

// ── Server-side drift detection ───────────────────────────────────────────
// Every 5s: compute expected position from server state, broadcast for clients
// to self-correct if they are too far off
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.state.playing) continue;
    const elapsed = (Date.now() - room.state.updatedAt) / 1000;
    const expected = room.state.position + elapsed;
    for (const ws of room.members.keys()) {
      send(ws, { type: 'DRIFT_CHECK', expected, serverTime: Date.now() });
    }
  }
}, 5000);

function broadcast(room, msg, excludeWs = null) {
  for (const ws of room.members.keys()) {
    if (ws !== excludeWs) send(ws, msg);
  }
}
function send(ws, msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`\n🎬 Cinelink Sync Server :${PORT}\n`));
