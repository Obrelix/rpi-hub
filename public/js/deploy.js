/* deploy.js — socket.io client for deploy progress */

const socket = io();

socket.on('deploy-progress', ({ id, text }) => {
  showLog(id, text);
});

/* ── Helpers ──────────────────────────────────────────────────────── */

function showLog(id, text) {
  const wrap = document.getElementById('log-wrap-' + id);
  const log  = document.getElementById('log-' + id);
  if (!wrap || !log) return;
  wrap.style.display = 'block';
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

function clearLog(id) {
  const log = document.getElementById('log-' + id);
  if (log) log.textContent = '';
}

/* ── Git Pull ─────────────────────────────────────────────────────── */

async function gitPull(serviceId) {
  clearLog(serviceId);
  showLog(serviceId, 'Running git pull…\n');

  try {
    const resp = await fetch('/deploy/' + serviceId + '/pull', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) {
      showLog(serviceId, 'ERROR: ' + (data.error || resp.statusText) + '\n');
    }
  } catch (err) {
    showLog(serviceId, 'ERROR: ' + err.message + '\n');
  }
}

/* ── Drag-and-drop ────────────────────────────────────────────────── */

function handleDragOver(event, serviceId) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  const zone = document.getElementById('drop-' + serviceId);
  if (zone) zone.classList.add('dragover');
}

function handleDragLeave(event, serviceId) {
  const zone = document.getElementById('drop-' + serviceId);
  if (zone) zone.classList.remove('dragover');
}

function handleDrop(event, serviceId) {
  event.preventDefault();
  const zone = document.getElementById('drop-' + serviceId);
  if (zone) zone.classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  if (file) uploadFile(serviceId, file);
}

/* ── File input ───────────────────────────────────────────────────── */

function handleFileSelect(event, serviceId) {
  const file = event.target.files[0];
  if (file) uploadFile(serviceId, file);
  event.target.value = '';
}

/* ── Upload ───────────────────────────────────────────────────────── */

async function uploadFile(serviceId, file) {
  clearLog(serviceId);
  showLog(serviceId, 'Uploading ' + file.name + '…\n');

  const formData = new FormData();
  formData.append('archive', file);

  try {
    const resp = await fetch('/deploy/' + serviceId + '/upload', {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (!resp.ok) {
      showLog(serviceId, 'ERROR: ' + (data.error || resp.statusText) + '\n');
    }
  } catch (err) {
    showLog(serviceId, 'ERROR: ' + err.message + '\n');
  }
}
