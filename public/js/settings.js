(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────────── */

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function api(url, opts) {
    try {
      const res = await fetch(url, opts);
      return await res.json();
    } catch {
      return { error: 'Network request failed' };
    }
  }

  function signalBars(signal) {
    if (signal >= 75) return '\u2582\u2584\u2586\u2588';
    if (signal >= 50) return '\u2582\u2584\u2586\u2007';
    if (signal >= 25) return '\u2582\u2584\u2007\u2007';
    return '\u2582\u2007\u2007\u2007';
  }

  /* ── load saved networks ─────────────────────────────────────────── */

  async function loadNetworks() {
    const data = await api('/settings/wifi');
    const status = document.getElementById('wifi-status');
    const list = document.getElementById('wifi-list');

    if (data.error) {
      status.textContent = 'WiFi management unavailable: ' + data.error;
      list.innerHTML = '<tr><td colspan="3" class="text-muted" style="text-align:center">Could not load networks</td></tr>';
      return;
    }

    const active = data.active;
    status.innerHTML = active
      ? 'Connected to: <strong>' + esc(active.name) + '</strong> (wlan0)'
      : '<span style="color:var(--warning)">Not connected</span>';

    if (!data.networks.length) {
      list.innerHTML = '<tr><td colspan="3" class="text-muted" style="text-align:center">No saved networks</td></tr>';
      return;
    }

    list.innerHTML = data.networks.map(function (net) {
      var isActive = active && active.uuid === net.uuid;
      var badge = isActive
        ? '<span class="wifi-badge wifi-badge-active">Connected</span>'
        : '<span class="wifi-badge">Saved</span>';
      var connectBtn = isActive
        ? ''
        : '<button class="btn btn-primary btn-sm" onclick="window.wifiConnect(\'' + esc(net.uuid) + '\')">Connect</button>';
      var removeBtn = '<button class="btn btn-danger btn-sm" onclick="window.wifiRemove(\'' + esc(net.uuid) + '\', ' + isActive + ', \'' + esc(net.name.replace(/'/g, "\\'")) + '\')">' + 'Remove</button>';

      return '<tr' + (isActive ? ' class="wifi-row-active"' : '') + '>' +
        '<td>' + esc(net.name) + '</td>' +
        '<td style="text-align:center">' + badge + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
        '<div style="display:flex;gap:.35rem;justify-content:flex-end">' + connectBtn + removeBtn + '</div></td>' +
        '</tr>';
    }).join('');
  }

  /* ── scan ──────────────────────────────────────────────────────── */

  window.wifiScan = async function () {
    var scanStatus = document.getElementById('wifi-scan-status');
    var scanResults = document.getElementById('wifi-scan-results');
    var scanList = document.getElementById('wifi-scan-list');

    scanStatus.textContent = 'Scanning…';
    scanResults.style.display = 'none';

    var data = await api('/settings/wifi/scan');
    scanStatus.textContent = '';

    if (data.error) {
      scanStatus.textContent = 'Scan failed: ' + data.error;
      return;
    }

    if (!data.available.length) {
      scanStatus.textContent = 'No networks found';
      return;
    }

    scanList.innerHTML = data.available.map(function (net) {
      return '<tr>' +
        '<td>' + esc(net.ssid) + '</td>' +
        '<td style="text-align:center" title="' + net.signal + '%">' + signalBars(net.signal) + ' ' + net.signal + '%</td>' +
        '<td style="text-align:center">' + esc(net.security || 'Open') + '</td>' +
        '<td style="text-align:right"><button class="btn btn-secondary btn-sm" onclick="window.wifiUseScanned(\'' + esc(net.ssid.replace(/'/g, "\\'")) + '\')">Use</button></td>' +
        '</tr>';
    }).join('');

    scanResults.style.display = 'block';
  };

  /* ── use scanned SSID ─────────────────────────────────────────── */

  window.wifiUseScanned = function (ssid) {
    document.getElementById('wifi-add-ssid').value = ssid;
    document.getElementById('wifi-add-pass').focus();
  };

  /* ── add network ──────────────────────────────────────────────── */

  window.wifiAdd = async function () {
    var ssid = document.getElementById('wifi-add-ssid').value.trim();
    var pass = document.getElementById('wifi-add-pass').value;

    if (!ssid) { showToast('Enter an SSID', 'error'); return; }
    if (pass.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }

    var data = await api('/settings/wifi/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: ssid, password: pass })
    });

    if (data.error) { showToast(data.error, 'error'); return; }

    showToast('Network "' + ssid + '" added', 'success');
    document.getElementById('wifi-add-ssid').value = '';
    document.getElementById('wifi-add-pass').value = '';
    loadNetworks();
  };

  /* ── remove network ───────────────────────────────────────────── */

  window.wifiRemove = async function (uuid, isActive, name) {
    var msg = 'Remove network "' + name + '"?';
    if (isActive) msg += '\n\nThis is the active connection — removing it may disconnect the Pi!';
    if (!confirm(msg)) return;

    var data = await api('/settings/wifi/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: uuid })
    });

    if (data.error) { showToast(data.error, 'error'); return; }

    showToast('Network removed', 'success');
    loadNetworks();
  };

  /* ── connect ──────────────────────────────────────────────────── */

  window.wifiConnect = async function (uuid) {
    showToast('Connecting…', 'info', 10000);

    var data = await api('/settings/wifi/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: uuid })
    });

    if (data.error) { showToast(data.error, 'error'); return; }

    showToast('Connected', 'success');
    loadNetworks();
  };

  /* ── password toggle ──────────────────────────────────────────── */

  window.wifiTogglePass = function (btn) {
    var input = btn.previousElementSibling;
    if (input.type === 'password') {
      input.type = 'text';
    } else {
      input.type = 'password';
    }
  };

  /* ── hotspot ────────────────────────────────────────────────────── */

  async function loadHotspotStatus() {
    var data = await api('/settings/wifi/hotspot');
    var toggle = document.getElementById('wifi-hotspot-toggle');
    var status = document.getElementById('wifi-hotspot-status');

    if (data.error) {
      status.textContent = 'Unavailable';
      toggle.disabled = true;
      return;
    }

    toggle.checked = data.enabled;
    if (data.enabled && data.active) {
      status.textContent = 'Enabled — monitor running';
      status.style.color = 'var(--success)';
    } else if (data.enabled) {
      status.textContent = 'Enabled — monitor not running';
      status.style.color = 'var(--warning)';
    } else {
      status.textContent = 'Disabled';
      status.style.color = '';
    }
  }

  window.wifiToggleHotspot = async function (enable) {
    var data = await api('/settings/wifi/hotspot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: enable })
    });

    if (data.error) {
      showToast(data.error, 'error');
      loadHotspotStatus();
      return;
    }

    showToast(enable ? 'Hotspot fallback enabled' : 'Hotspot fallback disabled', 'success');
    loadHotspotStatus();
  };

  /* ── init ──────────────────────────────────────────────────────── */

  /* ── System Power ──────────────────────────────────────────────── */

  function disablePowerButtons() {
    var rb = document.getElementById('btn-reboot');
    var sd = document.getElementById('btn-shutdown');
    if (rb) rb.disabled = true;
    if (sd) sd.disabled = true;
  }

  window.piReboot = async function () {
    if (!confirm('Are you sure you want to reboot the Raspberry Pi?')) return;
    try {
      await api('/settings/reboot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      showToast('Rebooting\u2026 The hub will be back shortly.', 'success');
      disablePowerButtons();
    } catch (err) {
      showToast('Reboot failed: ' + err.message, 'error');
    }
  };

  window.piShutdown = async function () {
    if (!confirm('Are you sure you want to shut down the Raspberry Pi?\n\nThe Pi will be unreachable until it is power-cycled.')) return;
    try {
      await api('/settings/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      showToast('Shutting down\u2026 The Pi will be unreachable.', 'success');
      disablePowerButtons();
    } catch (err) {
      showToast('Shutdown failed: ' + err.message, 'error');
    }
  };

  /* ── init ──────────────────────────────────────────────────────── */

  loadNetworks();
  loadHotspotStatus();
})();
