'use strict';

/**
 * Podcast management page for rpi-hub.
 * Playlist editing, RSS import, seek slider, and playback controls.
 * Communicates with rpi-podcast via Socket.io events relayed through the hub.
 */
(function () {
  var socket = io();

  // ── State ──────────────────────────────────────────────────────
  var playlist = [];       // working copy (local edits before save)
  var serverPlaylist = []; // last confirmed list from server
  var podcastState = { is_playing: false, volume: 70, episode_index: null, mode: null, connected: false };
  var nowPlaying = { episode_name: '', show: '', duration: 0, position: 0 };
  var positionInfo = { position: 0, duration: 0 };
  var hasChanges = false;
  var isSeeking = false;

  // ── DOM refs ───────────────────────────────────────────────────
  var tbody          = document.getElementById('episodeBody');
  var selectAllCb    = document.getElementById('selectAll');
  var episodeCount   = document.getElementById('episodeCount');
  var statusText     = document.getElementById('statusText');
  var saveBtn        = document.getElementById('saveEpisodes');
  var addBtn         = document.getElementById('addEpisode');
  var removeBtn      = document.getElementById('removeSelected');
  var exportBtn      = document.getElementById('exportCsv');
  var importInput    = document.getElementById('importCsv');
  var importRssBtn   = document.getElementById('importRss');

  var pcBar          = document.getElementById('pcNowPlayingBar');
  var pcShow         = document.getElementById('pcShow');
  var pcEpisode      = document.getElementById('pcEpisode');
  var pcPos          = document.getElementById('pcPos');
  var pcDur          = document.getElementById('pcDur');
  var pcSeek         = document.getElementById('pcSeek');
  var pcPlayPause    = document.getElementById('pcPlayPause');
  var pcPrev         = document.getElementById('pcPrev');
  var pcNext         = document.getElementById('pcNext');
  var pcVolume       = document.getElementById('pcVolume');
  var pcVolumeVal    = document.getElementById('pcVolumeVal');
  var pcStatusBadge  = document.getElementById('pcStatusBadge');

  // ── Helpers ────────────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function fmtTime(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }

  // ── Render table ───────────────────────────────────────────────
  function renderTable() {
    tbody.innerHTML = '';
    playlist.forEach(function (ep, i) {
      var tr = document.createElement('tr');
      var isActive = podcastState.connected && podcastState.episode_index === i && !hasChanges;
      if (isActive) tr.classList.add('playing');
      tr.dataset.index = i;
      tr.draggable = false;

      tr.innerHTML =
        '<td class="col-drag"><span class="drag-handle" draggable="true">&#9776;</span></td>' +
        '<td class="station-num col-num">' + (i + 1) + '</td>' +
        '<td class="station-checkbox col-check"><input type="checkbox"></td>' +
        '<td class="col-play"><button class="station-play-btn' + (isActive ? ' active' : '') + '" title="Play">&#9654;</button></td>' +
        '<td class="station-name-cell col-name">' + escapeHtml(ep.name) + (isActive ? '<span class="badge-playing">playing</span>' : '') + '</td>' +
        '<td class="station-url-cell">' + escapeHtml(ep.url) + '</td>' +
        '<td class="station-genre-cell col-genre">' + escapeHtml(ep.show || '') + '</td>' +
        '<td class="col-genre">' + (ep.duration != null ? fmtTime(ep.duration) : '') + '</td>';

      tbody.appendChild(tr);
    });
    updateCounts();
    updateSaveButton();
  }

  function updateCounts() {
    var text = playlist.length + ' episode' + (playlist.length !== 1 ? 's' : '');
    episodeCount.textContent = text;
    statusText.textContent = text;
  }

  function updateSaveButton() {
    hasChanges = JSON.stringify(playlist) !== JSON.stringify(serverPlaylist);
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
    if (!podcastState.connected) {
      pcBar.classList.add('offline');
      pcStatusBadge.textContent = 'Offline';
      pcStatusBadge.className = 'status-badge stopped';
    } else {
      pcBar.classList.remove('offline');
      pcStatusBadge.textContent = podcastState.is_playing ? 'Playing' : 'Paused';
      pcStatusBadge.className = 'status-badge ' + (podcastState.is_playing ? 'running' : 'stopped');
    }
    pcPlayPause.textContent = podcastState.is_playing ? '\u23F8' : '\u25B6';
    pcPlayPause.classList.toggle('playing', podcastState.is_playing);
    pcVolume.value = podcastState.volume;
    pcVolumeVal.textContent = podcastState.volume + '%';
    pcShow.textContent = nowPlaying.show || 'No episode';
    pcEpisode.textContent = nowPlaying.episode_name || '';
    updateSeekUi();
  }

  function updateSeekUi() {
    var duration = positionInfo.duration || nowPlaying.duration || 0;
    var position = positionInfo.position || 0;
    pcPos.textContent = fmtTime(position);
    pcDur.textContent = fmtTime(duration);
    if (duration > 0) {
      pcSeek.disabled = false;
      pcSeek.max = Math.floor(duration);
      if (!isSeeking) pcSeek.value = Math.floor(position);
    } else {
      pcSeek.disabled = true;
      pcSeek.max = 100;
      pcSeek.value = 0;
    }
  }

  // ── Socket.io listeners ────────────────────────────────────────
  socket.on('podcast:status', function (data) {
    podcastState = data || podcastState;
    updateNowPlayingBar();
    renderTable();
  });

  socket.on('podcast:now-playing', function (data) {
    nowPlaying = data || nowPlaying;
    if (nowPlaying.duration) positionInfo.duration = nowPlaying.duration;
    if (nowPlaying.position != null) positionInfo.position = nowPlaying.position;
    updateNowPlayingBar();
  });

  socket.on('podcast:playlist', function (data) {
    serverPlaylist = (data || []).map(function (ep) {
      return { name: ep.name || '', url: ep.url || '', duration: ep.duration == null ? null : ep.duration, show: ep.show || '' };
    });
    if (!hasChanges) {
      playlist = serverPlaylist.map(function (ep) { return Object.assign({}, ep); });
      renderTable();
    }
    updateSaveButton();
  });

  socket.on('podcast:position', function (data) {
    if (!data) return;
    positionInfo = { position: Number(data.position) || 0, duration: Number(data.duration) || 0 };
    updateSeekUi();
  });

  // ── Init ───────────────────────────────────────────────────────
  updateNowPlayingBar();
  renderTable();
})();
