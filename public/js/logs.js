/* ============================================================
   logs.js — Socket.io log streaming client
   ============================================================ */

(function () {
  'use strict';

  const socket = io();
  const logOutput = document.getElementById('logOutput');
  const serviceSelect = document.getElementById('serviceSelect');
  const pauseBtn = document.getElementById('pauseBtn');
  const clearBtn = document.getElementById('clearBtn');
  const filterInput = document.getElementById('filterInput');

  const MAX_LINES = 500;
  let lines = [];
  let paused = false;
  let filterText = '';

  serviceSelect.addEventListener('change', () => {
    const serviceId = serviceSelect.value;
    lines = [];
    logOutput.textContent = '';
    if (!serviceId) {
      socket.emit('unsubscribe-logs');
      pauseBtn.disabled = true;
      return;
    }
    socket.emit('subscribe-logs', serviceId);
    pauseBtn.disabled = false;
  });

  socket.on('log-line', (data) => {
    if (paused) return;
    const newLines = data.split('\n').filter(l => l.length > 0);
    lines.push(...newLines);
    if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
    renderLines();
  });

  socket.on('log-error', (data) => {
    showToast(data.message, 'error');
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    pauseBtn.className = paused ? 'btn btn-success' : 'btn';
  });

  clearBtn.addEventListener('click', () => {
    lines = [];
    logOutput.textContent = '';
  });

  filterInput.addEventListener('input', () => {
    filterText = filterInput.value.toLowerCase();
    renderLines();
  });

  function renderLines() {
    const filtered = filterText
      ? lines.filter(l => l.toLowerCase().includes(filterText))
      : lines;
    logOutput.textContent = filtered.join('\n');
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  socket.on('toast', (data) => {
    showToast(data.message, data.type);
  });
})();
