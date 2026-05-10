/**
 * Darts Trainer Server — V18.0
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

// ── Statische Dateien ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// Root → aktuelle App-Version (public/index.html = jeweils aktueller Deploy)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health-Check (für Uptime-Monitoring / Cron-Ping)
// /status als Alias für Backwards-Kompat mit alten render.yaml-Configs
function healthHandler(_req, res) {
  res.json({ status: 'ok', version: '18.0.0', uptime: process.uptime() });
}
app.get('/health', healthHandler);
app.get('/status', healthHandler);

// ── Room Management ───────────────────────────────────────────────────────────
/**
 * Room-Struktur:
 *   rooms.get(roomId) → {
 *     players: [Socket|null, Socket|null],
 *     names:   [string, string]
 *   }
 */
const rooms = new Map();

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // kein I, O, 0, 1 (Verwechslung)

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
      opponentName: room.names[0],
      roomId:       roomId
    });
    room.players[0].emit('opponent_joined', {
      opponentName: room.names[1]
    });
    console.log(`[${roomId}] "${playerName}" beigetreten. Raum voll.`);
  });

  // ── Spielstart + Spielzüge (unverändert seit V13) ─────────────────────────
  socket.on('game_start', ({ roomId, config }) => {
    socket.to(roomId).emit('game_start', config);
  });

  socket.on('game_action', ({ roomId, action }) => {
    socket.to(roomId).emit('game_action', action);
  });

  // ── V14 — Chat ───────────────────────────────────────────────────────────
  socket.on('chat_message', ({ roomId, text, playerName }) => {
    socket.to(roomId).emit('chat_message', { text, playerName });
  });

  // ── V16.6 — Undo-Sync ──────────────────────────────────────────────────────
  socket.on('undo_action', ({ roomId }) => {
    socket.to(roomId).emit('undo_pushed');
  });

  // ── V16.12 — Snapshot-Sync für Phoenix Chicago / Killer / Highscore ────────
  // Standard-Modi: Snapshot 1:1 an alle anderen im Room
  socket.on('chicago_state', (data) => {
    if (!data || !data.roomId) return;
    socket.to(data.roomId).emit('chicago_state', data);
  });
  socket.on('chicago_dart', (data) => {
    if (!data || !data.roomId) return;
    socket.to(data.roomId).emit('chicago_dart', data);
  });
  socket.on('highscore_state', (data) => {
    if (!data || !data.roomId) return;
    socket.to(data.roomId).emit('highscore_state', data);
  });
  socket.on('highscore_dart', (data) => {
    if (!data || !data.roomId) return;
    socket.to(data.roomId).emit('highscore_dart', data);
  });

  // Killer: Standard 1:1, Blind-Variante pro Spieler gefiltert
  socket.on('killer_state', (data) => {
    if (!data || !data.roomId || !data.state) return;
    const room = rooms.get(data.roomId);
    if (!room) return;
    const isBlind = data.state.variant === 'blind';
    if (!isBlind) {
      socket.to(data.roomId).emit('killer_state', data);
      return;
    }
    // Blind: filter pro Empfänger — verberge Doubles anderer (außer revealed=true)
    for (let idx = 0; idx < room.players.length; idx++) {
      const sock = room.players[idx];
      if (!sock || sock === socket) continue; // Sender überspringen
      const filteredState = {
        ...data.state,
        players: data.state.players.map((p, pIdx) => {
          if (pIdx === idx || p.revealed) return p;
          return { ...p, doubleField: { value: 0, mult: 0, label: '?' } };
        })
      };
      sock.emit('killer_state', { roomId: data.roomId, state: filteredState });
    }
  });
  socket.on('killer_dart', (data) => {
    if (!data || !data.roomId) return;
    socket.to(data.roomId).emit('killer_dart', data);
  });

  // ── V14 — WebRTC Signaling ────────────────────────────────────────────────
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
  console.log(`Darts Trainer Server V18.0 — Port ${PORT}`);
  console.log(`Lokal: http://localhost:${PORT}`);
});
