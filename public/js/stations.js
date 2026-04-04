'use strict';

/**
 * Station management page for rpi-hub.
 * Provides inline editing, drag-and-drop reorder, CSV import/export,
 * and per-station play buttons. Communicates with rpi-radio via Socket.io.
 */
(function () {
  var socket = io();

  // ── State ──────────────────────────────────────────────────────
  var stations = [];       // working copy (local edits before save)
  var serverStations = []; // last confirmed list from server
  var radioState = { is_playing: false, volume: 70, station_index: null, mode: 'spectrum', connected: false };
  var nowPlaying = { station_name: '', track_title: '', bitrate: '' };
  var hasChanges = false;

  // ── DOM refs ───────────────────────────────────────────────────
  var tbody = document.getElementById('stationBody');
  var selectAllCb = document.getElementById('selectAll');
  var stationCount = document.getElementById('stationCount');
  var statusText = document.getElementById('statusText');
  var saveBtn = document.getElementById('saveStations');
  var addBtn = document.getElementById('addStation');
  var removeBtn = document.getElementById('removeSelected');
  var exportBtn = document.getElementById('exportCsv');
  var importInput = document.getElementById('importCsv');
  var npBar = document.getElementById('now-playing-bar');
  var npStation = document.getElementById('npStation');
  var npTrack = document.getElementById('npTrack');
  var npMeta = document.getElementById('npMeta');
  var npPlayPause = document.getElementById('npPlayPause');
  var npPrev = document.getElementById('npPrev');
  var npNext = document.getElementById('npNext');
  var npVolume = document.getElementById('npVolume');
  var npVolumeVal = document.getElementById('npVolumeVal');
  var npMode = document.getElementById('npMode');
  var npStatusBadge = document.getElementById('npStatusBadge');

  // ── Render ─────────────────────────────────────────────────────
  function renderTable() {
    tbody.innerHTML = '';
    stations.forEach(function (s, i) {
      var tr = document.createElement('tr');
      var isPlaying = radioState.connected && radioState.station_index === i && !hasChanges;
      if (isPlaying) tr.classList.add('playing');
      tr.dataset.index = i;
      tr.draggable = false; // drag via handle only

      tr.innerHTML =
        '<td class="col-drag"><span class="drag-handle" draggable="true">&#9776;</span></td>' +
        '<td class="station-num col-num">' + (i + 1) + '</td>' +
        '<td class="station-checkbox col-check"><input type="checkbox"></td>' +
        '<td class="col-play"><button class="station-play-btn' + (isPlaying ? ' active' : '') + '" title="Play">&#9654;</button></td>' +
        '<td class="station-name-cell col-name">' + escapeHtml(s.name) + (isPlaying ? '<span class="badge-playing">playing</span>' : '') + '</td>' +
        '<td class="station-url-cell">' + escapeHtml(s.url) + '</td>' +
        '<td class="station-genre-cell col-genre">' + escapeHtml(s.genre || '') + '</td>';

      tbody.appendChild(tr);
    });
    updateCounts();
    updateSaveButton();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateCounts() {
    var text = stations.length + ' station' + (stations.length !== 1 ? 's' : '');
    stationCount.textContent = text;
    statusText.textContent = text;
  }

  function updateSaveButton() {
    hasChanges = JSON.stringify(stations) !== JSON.stringify(serverStations);
    if (hasChanges) {
      saveBtn.classList.add('has-changes');
      saveBtn.textContent = 'Save *';
    } else {
      saveBtn.classList.remove('has-changes');
      saveBtn.textContent = 'Save';
    }
  }

  // ── Now Playing Bar ────────────────────────────────────────────
  function updateNowPlayingBar() {
    if (!radioState.connected) {
      npBar.classList.add('offline');
      npStatusBadge.textContent = 'Offline';
      npStatusBadge.className = 'status-badge stopped';
    } else {
      npBar.classList.remove('offline');
      npStatusBadge.textContent = radioState.is_playing ? 'Playing' : 'Paused';
      npStatusBadge.className = 'status-badge ' + (radioState.is_playing ? 'running' : 'stopped');
    }
    npPlayPause.textContent = radioState.is_playing ? '\u23F8' : '\u25B6';
    npPlayPause.classList.toggle('playing', radioState.is_playing);
    npVolume.value = radioState.volume;
    npVolumeVal.textContent = radioState.volume + '%';
    npMode.value = radioState.mode;
    npStation.textContent = nowPlaying.station_name || 'No station';
    npTrack.textContent = nowPlaying.track_title || '';
    npMeta.textContent = nowPlaying.bitrate || '';
  }

  // ── Socket.io listeners ────────────────────────────────────────
  socket.on('radio:status', function (data) {
    radioState = data;
    updateNowPlayingBar();
    renderTable();
  });

  socket.on('radio:now-playing', function (data) {
    nowPlaying = data;
    updateNowPlayingBar();
  });

  socket.on('radio:stations', function (data) {
    serverStations = data.map(function (s) { return { name: s.name, url: s.url, genre: s.genre || '' }; });
    if (!hasChanges) {
      stations = serverStations.map(function (s) { return { name: s.name, url: s.url, genre: s.genre }; });
      renderTable();
    }
    updateSaveButton();
  });

  // ── Now Playing Bar controls ───────────────────────────────────
  npPlayPause.addEventListener('click', function () {
    if (!radioState.connected) { showToast('Radio service is offline', 'warning'); return; }
    socket.emit(radioState.is_playing ? 'radio:pause' : 'radio:play', {});
  });
  npPrev.addEventListener('click', function () {
    if (!radioState.connected) { showToast('Radio service is offline', 'warning'); return; }
    socket.emit('radio:prev', {});
  });
  npNext.addEventListener('click', function () {
    if (!radioState.connected) { showToast('Radio service is offline', 'warning'); return; }
    socket.emit('radio:next', {});
  });

  var volumeTimeout;
  npVolume.addEventListener('input', function () {
    npVolumeVal.textContent = npVolume.value + '%';
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(function () {
      socket.emit('radio:volume', { volume: parseInt(npVolume.value) });
    }, 100);
  });

  npMode.addEventListener('change', function () {
    socket.emit('radio:mode', { mode: npMode.value });
  });

  // ── Inline editing ─────────────────────────────────────────────
  tbody.addEventListener('dblclick', function (e) {
    var cell = e.target.closest('.station-name-cell, .station-url-cell, .station-genre-cell');
    if (!cell || cell.querySelector('input')) return;

    var tr = cell.closest('tr');
    var idx = parseInt(tr.dataset.index);
    var field = cell.classList.contains('station-name-cell') ? 'name' :
                cell.classList.contains('station-url-cell') ? 'url' : 'genre';
    var oldValue = stations[idx][field];

    var input = document.createElement('input');
    input.type = 'text';
    input.value = oldValue;
    input.className = 'editing' + (field === 'url' ? ' url-input' : '');
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      var val = input.value.trim();
      stations[idx][field] = val;
      renderTable();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { input.blur(); }
      if (ev.key === 'Escape') { stations[idx][field] = oldValue; renderTable(); }
    });
  });

  // ── Play button ────────────────────────────────────────────────
  tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('.station-play-btn');
    if (!btn) return;
    if (!radioState.connected) { showToast('Radio service is offline', 'warning'); return; }

    var tr = btn.closest('tr');
    var idx = parseInt(tr.dataset.index);

    if (hasChanges) {
      doSave(function () {
        socket.emit('radio:play', { index: idx });
      });
    } else {
      socket.emit('radio:play', { index: idx });
    }
  });

  // ── Checkbox handling ──────────────────────────────────────────
  selectAllCb.addEventListener('change', function () {
    var cbs = tbody.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(function (cb) { cb.checked = selectAllCb.checked; });
    updateRemoveButton();
  });

  tbody.addEventListener('change', function (e) {
    if (e.target.type === 'checkbox') updateRemoveButton();
  });

  function updateRemoveButton() {
    var checked = tbody.querySelectorAll('input[type="checkbox"]:checked');
    removeBtn.disabled = checked.length === 0;
    removeBtn.textContent = checked.length > 0
      ? 'Remove Selected (' + checked.length + ')'
      : 'Remove Selected';
  }

  // ── Add station ────────────────────────────────────────────────
  addBtn.addEventListener('click', function () {
    stations.push({ name: '', url: '', genre: '' });
    renderTable();
    // Focus the new row's name cell for editing
    var lastRow = tbody.lastElementChild;
    if (lastRow) {
      var nameCell = lastRow.querySelector('.station-name-cell');
      if (nameCell) nameCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
  });

  // ── Remove selected ────────────────────────────────────────────
  removeBtn.addEventListener('click', function () {
    var cbs = tbody.querySelectorAll('input[type="checkbox"]:checked');
    if (cbs.length === 0) return;

    var indices = [];
    cbs.forEach(function (cb) {
      var tr = cb.closest('tr');
      indices.push(parseInt(tr.dataset.index));
    });

    var names = indices.map(function (i) { return stations[i].name || '(unnamed)'; }).join(', ');
    if (!confirm('Remove ' + indices.length + ' station(s)?\n\n' + names)) return;

    // Remove from highest index to lowest to avoid shifting issues
    indices.sort(function (a, b) { return b - a; });
    indices.forEach(function (i) { stations.splice(i, 1); });

    selectAllCb.checked = false;
    renderTable();
  });

  // ── Save ───────────────────────────────────────────────────────
  saveBtn.addEventListener('click', function () { doSave(); });

  function doSave(callback) {
    if (!radioState.connected) { showToast('Radio service is offline', 'warning'); return; }

    socket.emit('radio:stations-update', { stations: stations });
    showToast('Stations saved', 'success');
    if (callback) {
      // Wait for the server to confirm before calling back
      socket.once('radio:stations', function () { callback(); });
    }
  }

  // ── Drag and Drop ──────────────────────────────────────────────
  var dragSrcIdx = null;

  tbody.addEventListener('dragstart', function (e) {
    var handle = e.target.closest('.drag-handle');
    if (!handle) { e.preventDefault(); return; }
    var tr = handle.closest('tr');
    dragSrcIdx = parseInt(tr.dataset.index);
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIdx);
  });

  tbody.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var tr = e.target.closest('tr');
    if (tr) {
      clearDragOver();
      tr.classList.add('drag-over');
    }
  });

  tbody.addEventListener('dragleave', function (e) {
    var tr = e.target.closest('tr');
    if (tr) tr.classList.remove('drag-over');
  });

  tbody.addEventListener('drop', function (e) {
    e.preventDefault();
    clearDragOver();
    var tr = e.target.closest('tr');
    if (!tr || dragSrcIdx === null) return;

    var dropIdx = parseInt(tr.dataset.index);
    if (dragSrcIdx === dropIdx) return;

    var moved = stations.splice(dragSrcIdx, 1)[0];
    stations.splice(dropIdx, 0, moved);
    dragSrcIdx = null;
    renderTable();
  });

  tbody.addEventListener('dragend', function () {
    clearDragOver();
    dragSrcIdx = null;
    var dragging = tbody.querySelector('.dragging');
    if (dragging) dragging.classList.remove('dragging');
  });

  function clearDragOver() {
    tbody.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
  }

  // ── CSV Import ─────────────────────────────────────────────────
  importInput.addEventListener('change', function () {
    var file = importInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      var lines = e.target.result.split(/\r?\n/);
      var imported = 0;
      lines.forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var parts = line.split('\t');
        if (parts.length >= 2 && parts[0] && parts[1]) {
          stations.push({
            name: parts[0].trim(),
            url: parts[1].trim(),
            genre: (parts[2] || '').trim(),
          });
          imported++;
        }
      });
      if (imported > 0) {
        renderTable();
        showToast('Imported ' + imported + ' station(s)', 'success');
      } else {
        showToast('No valid stations found in file', 'warning');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  // ── CSV Export ─────────────────────────────────────────────────
  exportBtn.addEventListener('click', function () {
    var csv = stations.map(function (s) {
      return s.name + '\t' + s.url + '\t' + (s.genre || '');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/tab-separated-values' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stations.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ── Init ───────────────────────────────────────────────────────
  updateNowPlayingBar();
  renderTable();
})();
