'use strict';

/**
 * Socket.io relay for rpi-podcast remote control.
 *
 * rpi-podcast connects as a Socket.io client and identifies itself by emitting
 * podcast:status. The server relays commands from dashboard browsers to
 * rpi-podcast and broadcasts status/metadata updates back to all browsers.
 */
function setupPodcastSocket(io) {
  let podcastSocketId = null;

  let cachedStatus = null;
  let cachedNowPlaying = null;
  let cachedPlaylist = null;
  let cachedPosition = null;

  function clampVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(150, Math.round(n)));
  }

  function isHttpUrl(s) {
    if (typeof s !== 'string') return false;
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  function isValidPlaylist(list) {
    if (!Array.isArray(list)) return false;
    return list.every(item =>
      item && typeof item.name === 'string' && isHttpUrl(item.url)
    );
  }

  function sendToPodcast(fromSocket, event, payload) {
    if (!podcastSocketId || fromSocket.id === podcastSocketId) return;
    const target = io.sockets.sockets.get(podcastSocketId);
    if (target) target.emit(event, payload);
  }

  io.on('connection', (socket) => {
    if (cachedStatus)     socket.emit('podcast:status',      cachedStatus);
    if (cachedNowPlaying) socket.emit('podcast:now-playing', cachedNowPlaying);
    if (cachedPlaylist)   socket.emit('podcast:playlist',    cachedPlaylist);
    if (cachedPosition)   socket.emit('podcast:position',    cachedPosition);

    socket.on('podcast:status', (data) => {
      if (!podcastSocketId || podcastSocketId === socket.id) {
        podcastSocketId = socket.id;
      }
      cachedStatus = data;
      io.emit('podcast:status', data);
    });

    socket.on('podcast:now-playing', (data) => {
      cachedNowPlaying = data;
      io.emit('podcast:now-playing', data);
    });

    socket.on('podcast:playlist', (data) => {
      cachedPlaylist = data;
      io.emit('podcast:playlist', data);
    });

    socket.on('podcast:position', (data) => {
      cachedPosition = data;
      io.emit('podcast:position', data);
    });

    socket.on('podcast:play', (data) => {
      sendToPodcast(socket, 'podcast:play', data || {});
    });

    socket.on('podcast:pause', () => {
      sendToPodcast(socket, 'podcast:pause', {});
    });

    socket.on('podcast:next', () => {
      sendToPodcast(socket, 'podcast:next', {});
    });

    socket.on('podcast:prev', () => {
      sendToPodcast(socket, 'podcast:prev', {});
    });

    socket.on('podcast:volume', (data) => {
      const volume = clampVolume(data && data.volume);
      sendToPodcast(socket, 'podcast:volume', { volume });
    });

    socket.on('podcast:seek', (data) => {
      const pos = Number(data && data.position);
      if (!Number.isFinite(pos) || pos < 0) return;
      sendToPodcast(socket, 'podcast:seek', { position: pos });
    });

    socket.on('podcast:playlist-update', (data) => {
      if (!isValidPlaylist(data)) return;
      sendToPodcast(socket, 'podcast:playlist-update', data);
    });

    socket.on('disconnect', () => {
      if (podcastSocketId === socket.id) {
        podcastSocketId = null;
        io.emit('podcast:status', { is_playing: false, connected: false });
        console.log('rpi-podcast disconnected');
      }
    });
  });
}

module.exports = setupPodcastSocket;
