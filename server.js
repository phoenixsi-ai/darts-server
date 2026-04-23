/**
 * Darts Trainer Server — V16.2
 * Node.js + Express + Socket.io
 *
 * Start: node server.js
 * Dev:   npx nodemon server.js
 * Port:  3000 (lokal) | process.env.PORT (Render / Cloud)
 */

const express   = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path      = require('path');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:  60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// ── Static Files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Root → aktuelle App-Version
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health-Check (für Uptime-Monitoring / Cron-Ping)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '16.2', uptime: process.uptime() });
});

// ── Room Management ───────────────────────────────────────────────────────────
const rooms = new Map();

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genRoomId() {
  let id;
  do {
    id = Array.from({ length: 5 }, () =>
      ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]
    ).join('');
  } while (rooms.has(id));
  return id;
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;
  let playerIdx   = null;

  // ── Raum erstellen (Spieler 0) ────────────────────────────────────────────
  socket.on('create_room', ({ playerName }) => {
    const roomId = genRoomId();
    rooms.set(roomId, {
      players: [socket, null],
      names:   [playerName || 'Spieler 1', '']
    });
    currentRoom = roomId;
    playerIdx   = 0;
    socket.join(roomId);
    socket.emit('room_created', { roomId, playerIdx: 0 });
    console.log(`[${roomId}] Erstellt von "${playerName}"`);
  });

  // ── Raum beitreten (Spieler 1) ────────────────────────────────────────────
  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('join_error', 'Raum nicht gefunden.');
      return;
    }
    if (room.players[1]) {
      socket.emit('join_error', 'Raum ist bereits voll.');
      return;
    }

    room.players[1] = socket;
    room.names[1]   = playerName || 'Spieler 2';
    currentRoom     = roomId;
    playerIdx       = 1;
    socket.join(roomId);

    socket.emit('room_joined', {
      playerIdx:    1,
      opponentName: room.names[0]
    });
    room.players[0].emit('opponent_joined', {
      opponentName: room.names[1]
    });
    console.log(`[${roomId}] "${playerName}" beigetreten. Raum voll.`);
  });

  // ── Spielstart + Spielzüge ────────────────────────────────────────────────
  socket.on('game_start', ({ roomId, config }) => {
    socket.to(roomId).emit('game_start', config);
  });

  socket.on('game_action', ({ roomId, action }) => {
    socket.to(roomId).emit('game_action', action);
  });

  // ── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat_message', ({ roomId, text, playerName }) => {
    socket.to(roomId).emit('chat_message', { text, playerName });
  });

  // ── WebRTC Signaling ──────────────────────────────────────────────────────
  socket.on('rtc_offer',  ({ roomId, sdp })       =>
    socket.to(roomId).emit('rtc_offer',  { sdp }));
  socket.on('rtc_answer', ({ roomId, sdp })       =>
    socket.to(roomId).emit('rtc_answer', { sdp }));
  socket.on('rtc_ice',    ({ roomId, candidate }) =>
    socket.to(roomId).emit('rtc_ice',    { candidate }));

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const opponentIdx    = 1 - playerIdx;
    const opponentSocket = room.players[opponentIdx];
    const myName         = room.names[playerIdx] || 'Gegner';

    if (opponentSocket && opponentSocket.connected) {
      opponentSocket.emit('player_disconnected', { playerName: myName });
    }
    rooms.delete(currentRoom);
    console.log(`[${currentRoom}] "${myName}" getrennt. Raum gelöscht.`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`Darts Trainer Server V16.2 — Port ${PORT}`);
  console.log(`Lokal: http://localhost:${PORT}`);
});
