function setupStatsBroadcast(io, stats, intervalMs) {
  let timer = null;

  function start() {
    timer = setInterval(async () => {
      try {
        const data = await stats.getAll();
        io.emit('stats', data);
      } catch (err) {
        console.error('Stats broadcast error:', err.message);
      }
    }, intervalMs);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { start, stop };
}

module.exports = { setupStatsBroadcast };
