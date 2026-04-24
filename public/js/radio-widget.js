'use strict';

/**
 * Radio control widget for the rpi-hub dashboard.
 * Communicates with rpi-radio via Socket.io events relayed through the hub.
 */
(function () {
  const socket = io();
  const widget = document.getElementById('radio-widget');
  if (!widget) return;

  // State
  let radioState = { is_playing: false, volume: 70, station_index: null, station_count: 0, mode: 'spectrum', connected: false };
  let nowPlaying = { station_name: '', track_title: '', bitrate: '' };
  let stations = [];

  // DOM references
  const statusBadge = widget.querySelector('.radio-status-badge');
  const stationName = widget.querySelector('.radio-station-name');
  const trackTitle = widget.querySelector('.radio-track-title');
  const bitrateEl = widget.querySelector('.radio-bitrate');
  const playPauseBtn = widget.querySelector('.radio-play-pause');
  const prevBtn = widget.querySelector('.radio-prev');
  const nextBtn = widget.querySelector('.radio-next');
  const volumeSlider = widget.querySelector('.radio-volume');
  const volumeLabel = widget.querySelector('.radio-volume-label');
  const stationSelect = widget.querySelector('.radio-station-select');
  const modeSelect = widget.querySelector('.radio-mode-select');

  function updateStatus() {
    if (!radioState.connected) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'radio-status-badge stopped';
      widget.classList.add('radio-offline');
    } else {
      widget.classList.remove('radio-offline');
      statusBadge.textContent = radioState.is_playing ? 'Playing' : 'Paused';
      statusBadge.className = 'radio-status-badge ' + (radioState.is_playing ? 'running' : 'stopped');
    }
    playPauseBtn.textContent = radioState.is_playing ? '\u23F8' : '\u25B6';
    volumeSlider.value = radioState.volume;
    volumeLabel.textContent = radioState.volume + '%';
    modeSelect.value = radioState.mode;
    if (radioState.station_index !== null) {
      stationSelect.value = radioState.station_index;
    }
    updateSummary();
  }

  function updateNowPlaying() {
    stationName.textContent = nowPlaying.station_name || 'No station';
    trackTitle.textContent = nowPlaying.track_title || '';
    bitrateEl.textContent = nowPlaying.bitrate || '';
    updateSummary();
  }

  function updateSummary() {
    if (typeof window.setWidgetSummary !== 'function') return;
    let text;
    if (!radioState.connected) {
      text = 'Offline';
    } else if (radioState.is_playing && nowPlaying.station_name && nowPlaying.track_title) {
      text = '\u266A ' + nowPlaying.station_name + ' \u2014 ' + nowPlaying.track_title;
    } else if (radioState.is_playing && nowPlaying.station_name) {
      text = '\u266A ' + nowPlaying.station_name;
    } else if (radioState.is_playing) {
      text = 'Playing';
    } else {
      text = 'Paused';
    }
    window.setWidgetSummary('#radio-widget', text);
  }

  function updateStationList() {
    stationSelect.innerHTML = '';
    stations.forEach(function (s, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.name + (s.genre ? ' [' + s.genre + ']' : '');
      stationSelect.appendChild(opt);
    });
    if (radioState.station_index !== null) {
      stationSelect.value = radioState.station_index;
    }
  }

  // Socket.io listeners
  socket.on('radio:status', function (data) {
    radioState = data;
    updateStatus();
  });

  socket.on('radio:now-playing', function (data) {
    nowPlaying = data;
    updateNowPlaying();
  });

  socket.on('radio:stations', function (data) {
    stations = data;
    updateStationList();
  });

  // Controls
  playPauseBtn.addEventListener('click', function () {
    if (radioState.is_playing) {
      socket.emit('radio:pause', {});
    } else {
      socket.emit('radio:play', {});
    }
  });

  prevBtn.addEventListener('click', function () { socket.emit('radio:prev', {}); });
  nextBtn.addEventListener('click', function () { socket.emit('radio:next', {}); });

  var volumeTimeout;
  volumeSlider.addEventListener('input', function () {
    volumeLabel.textContent = volumeSlider.value + '%';
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(function () {
      socket.emit('radio:volume', { volume: parseInt(volumeSlider.value) });
    }, 100);
  });

  stationSelect.addEventListener('change', function () {
    socket.emit('radio:play', { index: parseInt(stationSelect.value) });
  });

  modeSelect.addEventListener('change', function () {
    socket.emit('radio:mode', { mode: modeSelect.value });
  });

  updateStatus();
  updateNowPlaying();
})();
