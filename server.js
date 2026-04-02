const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const { createApp } = require('./app');
const config = require('./config.json');
const { setupSockets } = require('./sockets/index');

const app = createApp();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// Make io accessible to routes
app.set('io', io);

const stats = app.get('stats');
const registry = app.get('registry');
setupSockets(io, { stats, registry }, config);

const port = config.port;
server.listen(port, '0.0.0.0', () => {
  console.log(`RPi Hub running at http://0.0.0.0:${port}`);
});
