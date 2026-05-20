// BARE NODE HTTP — kein Express, kein Socket.io
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Diag': 'BARE-NODE-' + PORT });
  res.end('BARE NODE RUNNING ON PORT ' + PORT + ' PATH=' + req.url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('BARE NODE SERVER on ' + PORT);
});
