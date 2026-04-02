/* ============================================================
   dashboard.js — Socket.io client + service control actions
   ============================================================ */

(function () {
  'use strict';

  const socket = io();

  /* ----------------------------------------------------------
     Stats helpers
     ---------------------------------------------------------- */
  function setBar(barId, percent) {
    const el = document.getElementById(barId);
    if (!el) return;
    const clamped = Math.min(100, Math.max(0, percent));
    el.style.width = clamped + '%';
    el.classList.remove('warning', 'danger');
    if (clamped >= 90) el.classList.add('danger');
    else if (clamped >= 70) el.classList.add('warning');
  }

  function setText(elId, text) {
    const el = document.getElementById(elId);
    if (el) el.textContent = text;
  }

  /* ----------------------------------------------------------
     Socket.io — stats broadcast
     ---------------------------------------------------------- */
  socket.on('stats', (data) => {
    // CPU
    if (data.cpu !== undefined) {
      setText('statCpuValue', data.cpu + '%');
      setBar('statCpuBar', data.cpu);
    }

    // Temperature
    if (data.temperature !== null && data.temperature !== undefined) {
      setText('statTempValue', data.temperature + '°C');
      // Map 20–85 °C range onto 0–100%
      const pct = Math.round(((data.temperature - 20) / 65) * 100);
      setBar('statTempBar', pct);
    } else {
      setText('statTempValue', 'N/A');
    }

    // Memory
    if (data.memory) {
      const pct = data.memory.usedPercent;
      setText('statMemValue', pct + '%');
      setBar('statMemBar', pct);
    }

    // Disk (first entry — root filesystem)
    if (data.disk && data.disk.length > 0) {
      const d = data.disk[0];
      setText('statDiskValue', d.usedPercent + '%');
      setBar('statDiskBar', d.usedPercent);
    }
  });

  /* ----------------------------------------------------------
     Socket.io — service state change → reload
     ---------------------------------------------------------- */
  socket.on('service-status-changed', () => {
    window.location.reload();
  });

  /* ----------------------------------------------------------
     Socket.io — toast relay
     ---------------------------------------------------------- */
  socket.on('toast', ({ message, type }) => {
    showToast(message, type || 'info');
  });

  /* ----------------------------------------------------------
     Service control helpers
     ---------------------------------------------------------- */
  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  async function apiPost(path, btn) {
    setLoading(btn, true);
    try {
      const res = await fetch(path, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error || 'Request failed', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
      setLoading(btn, false);
    }
    // Button re-enables on page reload triggered by socket event.
    // If no socket event arrives within 8s, re-enable manually.
    setTimeout(() => setLoading(btn, false), 8000);
  }

  /* ----------------------------------------------------------
     Public API (called from inline onclick in dashboard.ejs)
     ---------------------------------------------------------- */
  window.startService = function (id, btn) {
    apiPost('/api/services/' + id + '/start', btn);
  };

  window.stopService = function (id, btn) {
    apiPost('/api/services/' + id + '/stop', btn);
  };

  window.restartService = function (id, btn) {
    apiPost('/api/services/' + id + '/restart', btn);
  };
})();
