'use strict';

/**
 * Socket.io relay for rpi-radio remote control.
 *
 * rpi-radio connects as a Socket.io client and identifies itself by emitting
 * radio:status. The server relays commands from dashboard browsers to
 * rpi-radio and broadcasts status/metadata updates back to all browsers.
 */
function setupRadioSocket(io) {
  let radioSocketId = null;

  io.on('connection', (socket) => {
    // rpi-radio identifies itself by emitting radio:status on connect
    socket.on('radio:status', (data) => {
      if (!radioSocketId || radioSocketId === socket.id) {
        radioSocketId = socket.id;
      }
      io.emit('radio:status', data);
    });

    // Relay status events from rpi-radio to all dashboards
    socket.on('radio:now-playing', (data) => {
      io.emit('radio:now-playing', data);
    });

    socket.on('radio:stations', (data) => {
      io.emit('radio:stations', data);
    });

    // Relay commands from dashboard browsers to rpi-radio
    const commands = [
      'radio:play', 'radio:pause', 'radio:next', 'radio:prev',
      'radio:volume', 'radio:mode',
      'radio:station-add', 'radio:station-remove',
    ];
    commands.forEach((cmd) => {
      socket.on(cmd, (data) => {
        if (radioSocketId && socket.id !== radioSocketId) {
          const radioSocket = io.sockets.sockets.get(radioSocketId);
          if (radioSocket) {
            radioSocket.emit(cmd, data || {});
          }
        }
      });
    });

    // Handle rpi-radio disconnect
    socket.on('disconnect', () => {
      if (radioSocketId === socket.id) {
        radioSocketId = null;
        io.emit('radio:status', { is_playing: false, connected: false });
        console.log('rpi-radio disconnected');
      }
    });
  });
}

module.exports = setupRadioSocket;
