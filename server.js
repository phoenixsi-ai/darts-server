// BARE MINIMUM — Render Diagnose (kein Socket.io)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.json({ pong: true, PORT, pid: process.pid, ts: Date.now() });
});

app.get('/', (req, res) => res.send('HELLO FROM RENDER'));

app.listen(PORT, () => {
  console.log('BARE SERVER on port ' + PORT);
});
