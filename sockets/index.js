const { setupStatsBroadcast } = require('./stats');
const { setupLogsSocket } = require('./logs');
const setupRadioSocket = require('./radio');
const setupSignboardSocket = require('./signboard');

function setupSockets(io, services, config) {
  const statsBroadcast = setupStatsBroadcast(io, services.stats, config.statsIntervalMs);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  setupLogsSocket(io, services.registry);
  setupRadioSocket(io);
  setupSignboardSocket(io);

  statsBroadcast.start();
  return { statsBroadcast };
}

module.exports = { setupSockets };
