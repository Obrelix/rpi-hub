'use strict';

/**
 * Socket.io relay for rpi-signboard.
 *
 * rpi-signboard connects as a Socket.io client and identifies itself by
 * emitting signboard:status on connect. This module relays browser commands
 * (signboard:display, signboard:clear) to the service and broadcasts service
 * status events back to all dashboard browsers.
 *
 * Also persists the last 20 sent messages to disk (signboard-history.json)
 * so browsers can re-send previous messages with one click. History persists
 * across hub restarts.
 *
 * Validation of signboard:display payloads is duplicated from the Pi side
 * (ipc/socket_handler.py) on purpose — defense-in-depth. If you change the
 * constants below, update the Python side to match.
 */

const fs = require('fs');
const path = require('path');

// --- Constants --------------------------------------------------------------

const DEFAULT_HISTORY_FILE = path.join(
  __dirname,
  '..',
  'data',
  'signboard-history.json'
);
const HISTORY_MAX = 20;
const MAX_TEXT_LEN = 500;

const ALLOWED_MODES = new Set(['scroll-once', 'persist', 'loop']);
const ALLOWED_FONT_SIZES = new Set(['small', 'medium', 'large']);
const DEFAULT_COLOR = [255, 255, 255];
const DEFAULT_BG = [0, 0, 0];
const DEFAULT_FONT_SIZE = 'medium';
const DEFAULT_SPEED = 2;
const DEFAULT_MODE = 'scroll-once';

function getHistoryFile() {
  return process.env.SIGNBOARD_HISTORY_FILE || DEFAULT_HISTORY_FILE;
}

// --- Helpers ---------------------------------------------------------------

function ensureDataDir() {
  const dir = path.dirname(getHistoryFile());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadHistory() {
  try {
    ensureDataDir();
    const file = getHistoryFile();
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
  } catch (e) {
    console.error('[signboard] loadHistory error:', e.message);
    return [];
  }
}

function saveHistory(history) {
  try {
    ensureDataDir();
    fs.writeFileSync(getHistoryFile(), JSON.stringify(history, null, 2));
  } catch (e) {
    console.error('[signboard] saveHistory error:', e.message);
  }
}

function isColorTriple(c) {
  return (
    Array.isArray(c) &&
    c.length === 3 &&
    c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
  );
}

/**
 * Validate and normalize a signboard:display payload.
 * Returns the normalized object or null on any failure.
 */
function validateDisplay(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  if (typeof data.text !== 'string') return null;
  const trimmed = data.text.trim();
  if (!trimmed || data.text.length > MAX_TEXT_LEN) return null;

  const color = data.color === undefined ? DEFAULT_COLOR.slice() : data.color;
  if (!isColorTriple(color)) return null;

  const bg = data.bg === undefined ? DEFAULT_BG.slice() : data.bg;
  if (!isColorTriple(bg)) return null;

  const fontSize =
    data.fontSize === undefined ? DEFAULT_FONT_SIZE : data.fontSize;
  if (!ALLOWED_FONT_SIZES.has(fontSize)) return null;

  const mode = data.mode === undefined ? DEFAULT_MODE : data.mode;
  if (!ALLOWED_MODES.has(mode)) return null;

  let speed;
  if (data.speed === undefined) {
    speed = DEFAULT_SPEED;
  } else {
    const parsed = Number(data.speed);
    if (!Number.isFinite(parsed)) return null;
    speed = Math.max(1, Math.min(5, Math.trunc(parsed)));
  }

  return {
    text: data.text,
    color: color.slice(),
    bg: bg.slice(),
    fontSize,
    speed,
    mode,
  };
}

function sameHistoryEntry(a, b) {
  return (
    a.text === b.text &&
    a.fontSize === b.fontSize &&
    a.speed === b.speed &&
    a.mode === b.mode &&
    JSON.stringify(a.color) === JSON.stringify(b.color) &&
    JSON.stringify(a.bg) === JSON.stringify(b.bg)
  );
}

// --- Setup ------------------------------------------------------------------

function setupSignboardSocket(io) {
  let signboardSocketId = null;
  let cachedStatus = null;
  let history = loadHistory();

  io.on('connection', (socket) => {
    // Send cached status + history to every new connection
    if (cachedStatus) socket.emit('signboard:status', cachedStatus);
    socket.emit('signboard:history', history);

    // rpi-signboard identifies itself by emitting signboard:status on connect
    socket.on('signboard:status', (data) => {
      if (!signboardSocketId || signboardSocketId === socket.id) {
        signboardSocketId = socket.id;
      }
      cachedStatus = data;
      io.emit('signboard:status', data);
    });

    socket.on('signboard:done', (data) => {
      io.emit('signboard:done', data || {});
    });

    // Browser -> hub -> signboard
    socket.on('signboard:display', (data) => {
      // Ignore loopback from the signboard service itself
      if (signboardSocketId && socket.id === signboardSocketId) return;

      const clean = validateDisplay(data);
      if (!clean) return; // silently drop invalid

      // Forward to signboard service if it's connected
      if (signboardSocketId) {
        const sbSocket = io.sockets.sockets.get(signboardSocketId);
        if (sbSocket) sbSocket.emit('signboard:display', clean);
      }

      // Append to history even if the signboard is offline
      const entry = { ...clean, sentAt: new Date().toISOString() };
      history = [entry, ...history.filter((h) => !sameHistoryEntry(h, entry))].slice(
        0,
        HISTORY_MAX
      );
      saveHistory(history);
      io.emit('signboard:history', history);
    });

    socket.on('signboard:clear', () => {
      if (signboardSocketId && socket.id === signboardSocketId) return;
      if (signboardSocketId) {
        const sbSocket = io.sockets.sockets.get(signboardSocketId);
        if (sbSocket) sbSocket.emit('signboard:clear', {});
      }
    });

    socket.on('signboard:history-clear', () => {
      history = [];
      saveHistory(history);
      io.emit('signboard:history', history);
    });

    socket.on('disconnect', () => {
      if (signboardSocketId === socket.id) {
        signboardSocketId = null;
        cachedStatus = {
          connected: false,
          current_message: null,
          is_idle: true,
        };
        io.emit('signboard:status', cachedStatus);
        console.log('rpi-signboard disconnected');
      }
    });
  });
}

module.exports = setupSignboardSocket;
module.exports.setupSignboardSocket = setupSignboardSocket;
module.exports.validateDisplay = validateDisplay;
module.exports.loadHistory = loadHistory;
module.exports.saveHistory = saveHistory;
