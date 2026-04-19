'use strict';

/**
 * Signboard control widget for the rpi-hub dashboard.
 * Sends user-typed messages to rpi-signboard via Socket.io relay, and
 * shows recent message history with click-to-resend.
 */
(function () {
  const socket = io();
  const widget = document.getElementById('signboard-widget');
  if (!widget) return;

  // ---- Constants ------------------------------------------------------

  const PRESET_COLORS = [
    { name: 'White',   hex: '#ffffff' },
    { name: 'Red',     hex: '#ff3b30' },
    { name: 'Orange',  hex: '#ff9500' },
    { name: 'Yellow',  hex: '#ffcc00' },
    { name: 'Green',   hex: '#34c759' },
    { name: 'Cyan',    hex: '#00d4ff' },
    { name: 'Blue',    hex: '#0a84ff' },
    { name: 'Purple',  hex: '#af52de' },
    { name: 'Magenta', hex: '#ff2d92' },
    { name: 'Black',   hex: '#000000' },
  ];

  // ---- State ----------------------------------------------------------

  let sbState = { connected: false, current_message: null, is_idle: true };
  let history = [];

  // ---- DOM references -------------------------------------------------

  const statusBadge   = widget.querySelector('.signboard-status-badge');
  const currentLbl    = widget.querySelector('.signboard-current');
  const textarea      = widget.querySelector('.signboard-text');
  const fgSwatches    = widget.querySelector('.signboard-color-swatches');
  const fgHex         = widget.querySelector('.signboard-color-hex');
  const bgSwatches    = widget.querySelector('.signboard-bg-swatches');
  const bgHex         = widget.querySelector('.signboard-bg-hex');
  const speedSlider   = widget.querySelector('.signboard-speed');
  const speedLabel    = widget.querySelector('.signboard-speed-label');
  const sendBtn       = widget.querySelector('.signboard-send');
  const clearBtn      = widget.querySelector('.signboard-clear');
  const historyList   = widget.querySelector('.signboard-history');
  const clearHistBtn  = widget.querySelector('.signboard-clear-history');

  // ---- Helpers --------------------------------------------------------

  function hexToRgb(hex) {
    const m = /^#?([a-f0-9]{6})$/i.exec((hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  function rgbToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length !== 3) return '#ffffff';
    return (
      '#' +
      rgb
        .map(function (n) { return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0'); })
        .join('')
    );
  }

  function buildSwatches(container, onPick) {
    container.innerHTML = '';
    PRESET_COLORS.forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'signboard-swatch';
      btn.title = c.name;
      btn.style.backgroundColor = c.hex;
      btn.addEventListener('click', function () { onPick(c.hex); });
      container.appendChild(btn);
    });
  }

  function getSelectedRadio(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function setRadio(name, value) {
    const el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  function buildPayload() {
    const color = hexToRgb(fgHex.value) || [255, 255, 255];
    const bg    = hexToRgb(bgHex.value) || [0, 0, 0];
    return {
      text: textarea.value,
      color: color,
      bg: bg,
      fontSize: getSelectedRadio('signboard-size') || 'medium',
      speed: parseInt(speedSlider.value, 10) || 2,
      mode: getSelectedRadio('signboard-mode') || 'scroll-once',
    };
  }

  function applyPayloadToControls(p) {
    textarea.value = p.text || '';
    if (Array.isArray(p.color)) fgHex.value = rgbToHex(p.color);
    if (Array.isArray(p.bg))    bgHex.value = rgbToHex(p.bg);
    if (p.fontSize) setRadio('signboard-size', p.fontSize);
    if (p.mode)     setRadio('signboard-mode', p.mode);
    if (typeof p.speed === 'number') {
      speedSlider.value = p.speed;
      speedLabel.textContent = String(p.speed);
    }
  }

  function sendMessage(payload) {
    if (!payload || !payload.text || !payload.text.trim()) {
      if (typeof showToast === 'function') showToast('Enter a message first', 'warning');
      return;
    }
    socket.emit('signboard:display', payload);
  }

  // ---- UI updaters ----------------------------------------------------

  function updateStatus() {
    if (!sbState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'signboard-status-badge stopped';
      widget.classList.add('signboard-offline');
    } else {
      widget.classList.remove('signboard-offline');
      statusBadge.textContent = sbState.is_idle ? 'Idle' : 'Showing';
      statusBadge.className =
        'signboard-status-badge ' + (sbState.is_idle ? 'stopped' : 'running');
    }

    if (sbState.current_message && sbState.current_message.text) {
      currentLbl.textContent = 'Now: ' + sbState.current_message.text;
    } else {
      currentLbl.textContent = '';
    }
  }

  function renderHistory() {
    historyList.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'signboard-history-empty';
      empty.textContent = 'No recent messages';
      historyList.appendChild(empty);
      return;
    }
    history.forEach(function (h) {
      const row = document.createElement('div');
      row.className = 'signboard-history-row';

      const swatch = document.createElement('span');
      swatch.className = 'signboard-history-swatch';
      const fg = rgbToHex(h.color);
      const bg = rgbToHex(h.bg);
      swatch.style.background =
        'linear-gradient(135deg, ' + fg + ' 0%, ' + fg + ' 55%, ' + bg + ' 55%, ' + bg + ' 100%)';

      const text = document.createElement('span');
      text.className = 'signboard-history-text';
      text.textContent = h.text;
      text.title = (h.mode || '?') + ' \u00B7 ' + (h.fontSize || '?') + ' \u00B7 speed ' + (h.speed || '?');

      const resend = document.createElement('button');
      resend.type = 'button';
      resend.className = 'signboard-history-resend btn btn-secondary btn-sm';
      resend.textContent = 'Send';
      resend.addEventListener('click', function () {
        applyPayloadToControls(h);
        sendMessage(h);
      });

      row.appendChild(swatch);
      row.appendChild(text);
      row.appendChild(resend);
      historyList.appendChild(row);
    });
  }

  // ---- Socket.io listeners --------------------------------------------

  socket.on('signboard:status', function (data) {
    sbState = data || sbState;
    updateStatus();
  });

  socket.on('signboard:history', function (data) {
    history = Array.isArray(data) ? data : [];
    renderHistory();
  });

  socket.on('signboard:done', function () {
    // Status push handles the UI refresh; nothing to do here.
  });

  // ---- Event listeners ------------------------------------------------

  sendBtn.addEventListener('click', function () {
    sendMessage(buildPayload());
  });

  clearBtn.addEventListener('click', function () {
    socket.emit('signboard:clear', {});
  });

  clearHistBtn.addEventListener('click', function () {
    if (window.confirm('Clear recent message history?')) {
      socket.emit('signboard:history-clear', {});
    }
  });

  speedSlider.addEventListener('input', function () {
    speedLabel.textContent = speedSlider.value;
  });

  // Enter = send (Shift+Enter = newline)
  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      sendMessage(buildPayload());
    }
  });

  // ---- Init -----------------------------------------------------------

  buildSwatches(fgSwatches, function (hex) { fgHex.value = hex; });
  buildSwatches(bgSwatches, function (hex) { bgHex.value = hex; });
  speedLabel.textContent = speedSlider.value;
  updateStatus();
  renderHistory();
})();
