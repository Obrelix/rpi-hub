const { spawn } = require('child_process');

function setupLogsSocket(io, registry) {
  const activeStreams = new Map();

  io.on('connection', (socket) => {
    socket.on('subscribe-logs', (serviceId) => {
      const existing = activeStreams.get(socket.id);
      if (existing) { existing.kill(); activeStreams.delete(socket.id); }

      const svc = registry.get(serviceId);
      if (!svc) { socket.emit('log-error', { message: `Unknown service: ${serviceId}` }); return; }

      const proc = spawn('journalctl', ['-u', svc.unit, '-f', '-n', '50', '--no-pager'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      activeStreams.set(socket.id, proc);

      proc.stdout.on('data', (data) => { socket.emit('log-line', data.toString()); });
      proc.stderr.on('data', (data) => { socket.emit('log-error', { message: data.toString() }); });
      proc.on('close', () => { activeStreams.delete(socket.id); });
    });

    socket.on('unsubscribe-logs', () => {
      const proc = activeStreams.get(socket.id);
      if (proc) { proc.kill(); activeStreams.delete(socket.id); }
    });

    socket.on('disconnect', () => {
      const proc = activeStreams.get(socket.id);
      if (proc) { proc.kill(); activeStreams.delete(socket.id); }
    });
  });
}

module.exports = { setupLogsSocket };
