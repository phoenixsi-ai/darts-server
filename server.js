const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── Static Files ──────────────────────────────────────────────────────────────
// Serves public/index.html — the Darts App
app.use(express.static(path.join(__dirname, 'public')));

// rooms: { roomId → { players: [{id, name}], gameStarted: bool, createdAt: timestamp } }
const rooms = {};

// Clean up rooms older than 4 hours (abandoned)
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [id, room] of Object.entries(rooms)) {
    if (room.createdAt < cutoff) { delete rooms[id]; }
  }
}, 30 * 60 * 1000);

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function findRoomBySocket(socketId) {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.players.some(p => p.id === socketId)) return { roomId, room };
  }
  return null;
}

io.on('connection', (socket) => {
  // ── Create Room ──────────────────────────────────────────────────────────────
  socket.on('create_room', ({ playerName }) => {
    let roomId;
    do { roomId = genCode(); } while (rooms[roomId]);

    rooms[roomId] = {
      players: [{ id: socket.id, name: playerName }],
      gameStarted: false,
      createdAt: Date.now()
    };

    socket.join(roomId);
    socket.emit('room_created', { roomId, playerIdx: 0 });
    console.log(`[${roomId}] Created by ${playerName}`);
  });

  // ── Join Room ─────────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms[roomId];

    if (!room) {
      socket.emit('join_error', 'Raum nicht gefunden. Code richtig?');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join_error', 'Raum ist bereits voll.');
      return;
    }
    if (room.gameStarted) {
      socket.emit('join_error', 'Spiel läuft bereits.');
      return;
    }

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);

    socket.emit('room_joined', {
      roomId,
      playerIdx: 1,
      opponentName: room.players[0].name
    });

    socket.to(roomId).emit('opponent_joined', { opponentName: playerName });
    console.log(`[${roomId}] ${playerName} joined`);
  });

  // ── Game Start ────────────────────────────────────────────────────────────────
  socket.on('game_start', ({ roomId, config }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.gameStarted = true;
    socket.to(roomId).emit('game_start', config);
    console.log(`[${roomId}] Game started: ${config.mode}`);
  });

  // ── Game Action relay ─────────────────────────────────────────────────────────
  socket.on('game_action', ({ roomId, action }) => {
    socket.to(roomId).emit('game_action', action);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const found = findRoomBySocket(socket.id);
    if (found) {
      const { roomId, room } = found;
      const player = room.players.find(p => p.id === socket.id);
      io.to(roomId).emit('player_disconnected', {
        playerName: player ? player.name : 'Gegner'
      });
      delete rooms[roomId];
      console.log(`[${roomId}] Closed — ${player?.name} disconnected`);
    }
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    rooms: Object.keys(rooms).length,
    players: Object.values(rooms).reduce((s, r) => s + r.players.length, 0),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Darts Server running on port ${PORT}`);
  console.log(`App: http://localhost:${PORT}`);
  console.log(`Status: http://localhost:${PORT}/status`);
});
