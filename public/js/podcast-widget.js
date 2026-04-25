'use strict';

/**
 * Podcast control widget for the rpi-hub dashboard.
 * Communicates with rpi-podcast via Socket.io events relayed through the hub.
 */
(function () {
  var socket = io();
  var widget = document.getElementById('podcast-widget');
  if (!widget) return;

  var podcastState = { is_playing: false, volume: 70, episode_index: null, episode_count: 0, connected: false };
  var nowPlaying = { episode_name: '', show: '', duration: 0, position: 0 };
  var playlist = [];
  var positionInfo = { position: 0, duration: 0 };
  var isAdjustingVolume = false;

  var statusBadge    = widget.querySelector('.podcast-status-badge');
  var showName       = widget.querySelector('.podcast-show-name');
  var episodeName    = widget.querySelector('.podcast-episode-name');
  var positionEl     = widget.querySelector('.podcast-position');
  var playPauseBtn   = widget.querySelector('.podcast-play-pause');
  var prevBtn        = widget.querySelector('.podcast-prev');
  var nextBtn        = widget.querySelector('.podcast-next');
  var volumeSlider   = widget.querySelector('.podcast-volume');
  var volumeLabel    = widget.querySelector('.podcast-volume-label');
  var episodeSelect  = widget.querySelector('.podcast-episode-select');

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

  function updateStatus() {
    if (!podcastState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'podcast-status-badge stopped';
      widget.classList.add('podcast-offline');
    } else {
      widget.classList.remove('podcast-offline');
      statusBadge.textContent = podcastState.is_playing ? 'Playing' : 'Paused';
      statusBadge.className = 'podcast-status-badge ' + (podcastState.is_playing ? 'running' : 'stopped');
    }
    playPauseBtn.textContent = podcastState.is_playing ? '\u23F8' : '\u25B6';
    if (!isAdjustingVolume) {
      volumeSlider.value = podcastState.volume;
      volumeLabel.textContent = podcastState.volume + '%';
    }
    if (podcastState.episode_index !== null && podcastState.episode_index !== undefined) {
      episodeSelect.value = podcastState.episode_index;
    }
    updateSummary();
  }

  function updateNowPlaying() {
    showName.textContent = nowPlaying.show || 'No episode';
    episodeName.textContent = nowPlaying.episode_name || '';
    updatePosition();
    updateSummary();
  }

  function updatePosition() {
    var duration = positionInfo.duration || nowPlaying.duration || 0;
    var position = positionInfo.position || 0;
    positionEl.textContent = fmtTime(position) + (duration ? ' / ' + fmtTime(duration) : '');
  }

  function updateSummary() {
    if (typeof window.setWidgetSummary !== 'function') return;
    var text;
    if (!podcastState.connected) {
      text = 'Offline';
    } else if (podcastState.is_playing && nowPlaying.show && nowPlaying.episode_name) {
      text = '\u266A ' + nowPlaying.show + ' \u2014 ' + nowPlaying.episode_name;
    } else if (podcastState.is_playing && nowPlaying.episode_name) {
      text = '\u266A ' + nowPlaying.episode_name;
    } else if (podcastState.is_playing) {
      text = 'Playing';
    } else {
      text = 'Paused';
    }
    window.setWidgetSummary('#podcast-widget', text);
  }

  function updateEpisodeList() {
    episodeSelect.innerHTML = '';
    playlist.forEach(function (ep, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = ep.name + (ep.show ? ' [' + ep.show + ']' : '');
      episodeSelect.appendChild(opt);
    });
    if (podcastState.episode_index !== null && podcastState.episode_index !== undefined) {
      episodeSelect.value = podcastState.episode_index;
    }
  }

  // Socket.io listeners
  socket.on('podcast:status', function (data) {
    podcastState = Object.assign({}, podcastState, data || {});
    updateStatus();
  });

  socket.on('podcast:now-playing', function (data) {
    nowPlaying = Object.assign({}, nowPlaying, data || {});
    updateNowPlaying();
  });

  socket.on('podcast:playlist', function (data) {
    playlist = data || [];
    updateEpisodeList();
  });

  socket.on('podcast:position', function (data) {
    if (!data) return;
    positionInfo = { position: Number(data.position) || 0, duration: Number(data.duration) || 0 };
    updatePosition();
  });

  // Controls
  playPauseBtn.addEventListener('click', function () {
    socket.emit(podcastState.is_playing ? 'podcast:pause' : 'podcast:play', {});
  });
  prevBtn.addEventListener('click', function () { socket.emit('podcast:prev', {}); });
  nextBtn.addEventListener('click', function () { socket.emit('podcast:next', {}); });

  var volumeTimeout;
  volumeSlider.addEventListener('input', function () {
    isAdjustingVolume = true;
    volumeLabel.textContent = volumeSlider.value + '%';
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(function () {
      socket.emit('podcast:volume', { volume: parseInt(volumeSlider.value, 10) });
      isAdjustingVolume = false;
    }, 100);
  });

  episodeSelect.addEventListener('change', function () {
    socket.emit('podcast:play', { index: parseInt(episodeSelect.value, 10) });
  });

  updateStatus();
  updateNowPlaying();
})();
