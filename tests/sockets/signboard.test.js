'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Each test isolates the module so the in-module state (history, radioSocketId)
// starts fresh and so we can redirect HISTORY_FILE to a per-test tmp location.
function loadFreshModule(tmpDir) {
  jest.resetModules();
  process.env.SIGNBOARD_HISTORY_FILE = path.join(tmpDir, 'signboard-history.json');
  return require('../../sockets/signboard');
}

function makeFakeIo() {
  const broadcasts = [];
  const connectionHandlers = [];
  const perSocketEmits = new Map(); // socketId -> [[event, data], ...]

  const io = {
    sockets: { sockets: new Map() },
    on: jest.fn((event, fn) => {
      if (event === 'connection') connectionHandlers.push(fn);
    }),
    emit: jest.fn((event, data) => {
      broadcasts.push([event, data]);
    }),
    broadcasts,
  };

  function makeSocket(id) {
    const events = {};
    const emits = [];
    perSocketEmits.set(id, emits);
    const socket = {
      id,
      on: jest.fn((event, fn) => {
        events[event] = fn;
      }),
      emit: jest.fn((event, data) => {
        emits.push([event, data]);
      }),
      _trigger(event, data) {
        const fn = events[event];
        if (!fn) throw new Error(`no handler for ${event} on ${id}`);
        fn(data);
      },
      _events: events,
      _emits: emits,
    };
    io.sockets.sockets.set(id, socket);
    return socket;
  }

  function connect(id) {
    const socket = makeSocket(id);
    connectionHandlers.forEach((h) => h(socket));
    return socket;
  }

  return { io, connect, broadcasts, perSocketEmits };
}

describe('sockets/signboard', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signboard-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    delete process.env.SIGNBOARD_HISTORY_FILE;
  });

  // -------------------- Validation --------------------

  test('validateDisplay rejects non-object payloads', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay(null)).toBeNull();
    expect(validateDisplay(undefined)).toBeNull();
    expect(validateDisplay('string')).toBeNull();
    expect(validateDisplay(42)).toBeNull();
  });

  test('validateDisplay rejects missing text', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({})).toBeNull();
  });

  test('validateDisplay rejects empty text', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: '' })).toBeNull();
    expect(validateDisplay({ text: '   ' })).toBeNull();
  });

  test('validateDisplay rejects non-string text', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: 42 })).toBeNull();
  });

  test('validateDisplay rejects text over 500 chars', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: 'a'.repeat(501) })).toBeNull();
    expect(validateDisplay({ text: 'a'.repeat(500) })).not.toBeNull();
  });

  test('validateDisplay defaults color, bg, fontSize, speed, mode', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    const result = validateDisplay({ text: 'hi' });
    expect(result).not.toBeNull();
    expect(result.text).toBe('hi');
    expect(result.color).toEqual([255, 255, 255]);
    expect(result.bg).toEqual([0, 0, 0]);
    expect(result.fontSize).toBe('medium');
    expect(result.speed).toBe(2);
    expect(result.mode).toBe('scroll-once');
  });

  test('validateDisplay accepts valid color and bg', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    const r = validateDisplay({ text: 'hi', color: [10, 20, 30], bg: [40, 50, 60] });
    expect(r.color).toEqual([10, 20, 30]);
    expect(r.bg).toEqual([40, 50, 60]);
  });

  test('validateDisplay rejects malformed color', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: 'hi', color: [10, 20] })).toBeNull();
    expect(validateDisplay({ text: 'hi', color: [10, 20, 300] })).toBeNull();
    expect(validateDisplay({ text: 'hi', color: 'red' })).toBeNull();
    expect(validateDisplay({ text: 'hi', color: [10, 20, 30, 40] })).toBeNull();
  });

  test('validateDisplay clamps speed to 1..5', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: 'hi', speed: 0 }).speed).toBe(1);
    expect(validateDisplay({ text: 'hi', speed: 99 }).speed).toBe(5);
    expect(validateDisplay({ text: 'hi', speed: 3 }).speed).toBe(3);
  });

  test('validateDisplay rejects unknown fontSize', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: 'hi', fontSize: 'ginormous' })).toBeNull();
  });

  test('validateDisplay rejects unknown mode', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    expect(validateDisplay({ text: 'hi', mode: 'wiggle' })).toBeNull();
  });

  test('validateDisplay accepts all three valid modes', () => {
    const { validateDisplay } = loadFreshModule(tmpDir);
    for (const m of ['scroll-once', 'persist', 'loop']) {
      expect(validateDisplay({ text: 'hi', mode: m }).mode).toBe(m);
    }
  });

  // -------------------- Relay behavior --------------------

  test('new browser connection receives cached status and history', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);

    // The first connected socket is the signboard service — it identifies itself
    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', {
      connected: true,
      current_message: null,
      is_idle: true,
    });

    // A new browser connection should receive both cached status and history
    const browserSocket = connect('browser-socket');
    const eventsSent = browserSocket._emits.map(([e]) => e);
    expect(eventsSent).toContain('signboard:status');
    expect(eventsSent).toContain('signboard:history');
  });

  test('signboard:status from service is broadcast', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', { connected: true, current_message: null, is_idle: true });

    const statusBroadcasts = broadcasts.filter(([e]) => e === 'signboard:status');
    expect(statusBroadcasts.length).toBeGreaterThanOrEqual(1);
  });

  test('signboard:display from browser is forwarded to signboard service', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', { connected: true, current_message: null, is_idle: true });

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: 'Hello world' });

    const displayEvents = sbSocket._emits.filter(([e]) => e === 'signboard:display');
    expect(displayEvents.length).toBe(1);
    expect(displayEvents[0][1]).toMatchObject({
      text: 'Hello world',
      color: [255, 255, 255],
      bg: [0, 0, 0],
      fontSize: 'medium',
      speed: 2,
      mode: 'scroll-once',
    });
  });

  test('signboard:display from browser is appended to history', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: 'in history' });

    const historyBroadcasts = broadcasts.filter(([e]) => e === 'signboard:history');
    expect(historyBroadcasts.length).toBeGreaterThan(0);
    const latest = historyBroadcasts[historyBroadcasts.length - 1][1];
    expect(Array.isArray(latest)).toBe(true);
    expect(latest[0].text).toBe('in history');
    expect(latest[0].sentAt).toBeTruthy();
  });

  test('signboard:display with invalid payload is not forwarded or added to history', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', { connected: true, current_message: null, is_idle: true });

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: '' });

    const displayEvents = sbSocket._emits.filter(([e]) => e === 'signboard:display');
    expect(displayEvents.length).toBe(0);

    const historyBroadcasts = broadcasts.filter(([e]) => e === 'signboard:history');
    // History was sent once on connect (empty) — but no new non-empty broadcast
    const nonEmpty = historyBroadcasts.filter(([, h]) => h && h.length > 0);
    expect(nonEmpty.length).toBe(0);
  });

  test('signboard:display works even when signboard service is offline (still appends to history)', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    // No signboard service connected, just a browser
    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: 'offline still counts' });

    const historyBroadcasts = broadcasts.filter(([e]) => e === 'signboard:history');
    const latest = historyBroadcasts[historyBroadcasts.length - 1][1];
    expect(latest[0].text).toBe('offline still counts');
  });

  test('signboard:clear from browser is forwarded to service', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', { connected: true, current_message: null, is_idle: true });

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:clear', {});

    const clearEvents = sbSocket._emits.filter(([e]) => e === 'signboard:clear');
    expect(clearEvents.length).toBe(1);
  });

  test('signboard disconnect broadcasts offline status', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', { connected: true, current_message: null, is_idle: true });
    sbSocket._trigger('disconnect');

    const statusBroadcasts = broadcasts.filter(([e]) => e === 'signboard:status');
    const last = statusBroadcasts[statusBroadcasts.length - 1][1];
    expect(last.connected).toBe(false);
    expect(last.is_idle).toBe(true);
    expect(last.current_message).toBeNull();
  });

  // -------------------- History persistence --------------------

  test('history is persisted to SIGNBOARD_HISTORY_FILE', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: 'persist me' });

    const historyFile = process.env.SIGNBOARD_HISTORY_FILE;
    expect(fs.existsSync(historyFile)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    expect(saved[0].text).toBe('persist me');
  });

  test('history is capped at 20 entries', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const browserSocket = connect('browser-socket');
    for (let i = 0; i < 25; i++) {
      browserSocket._trigger('signboard:display', { text: `msg ${i}` });
    }
    const saved = JSON.parse(fs.readFileSync(process.env.SIGNBOARD_HISTORY_FILE, 'utf-8'));
    expect(saved.length).toBeLessThanOrEqual(20);
    // Newest first
    expect(saved[0].text).toBe('msg 24');
  });

  test('dedup: identical content moves to top instead of duplicating', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: 'alpha' });
    browserSocket._trigger('signboard:display', { text: 'beta' });
    browserSocket._trigger('signboard:display', { text: 'alpha' });

    const saved = JSON.parse(fs.readFileSync(process.env.SIGNBOARD_HISTORY_FILE, 'utf-8'));
    const alphas = saved.filter((e) => e.text === 'alpha');
    expect(alphas.length).toBe(1);
    expect(saved[0].text).toBe('alpha'); // most recent
    expect(saved[1].text).toBe('beta');
  });

  test('signboard:history-clear wipes history and broadcasts empty', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const browserSocket = connect('browser-socket');
    browserSocket._trigger('signboard:display', { text: 'temp' });
    browserSocket._trigger('signboard:history-clear');

    const historyBroadcasts = broadcasts.filter(([e]) => e === 'signboard:history');
    const last = historyBroadcasts[historyBroadcasts.length - 1][1];
    expect(last).toEqual([]);

    const saved = JSON.parse(fs.readFileSync(process.env.SIGNBOARD_HISTORY_FILE, 'utf-8'));
    expect(saved).toEqual([]);
  });

  test('history survives module reload', () => {
    // First session: write a message
    let mod = loadFreshModule(tmpDir);
    let { io, connect } = makeFakeIo();
    mod.setupSignboardSocket(io);
    const browser1 = connect('browser-1');
    browser1._trigger('signboard:display', { text: 'persisted' });

    // Second session: reload module, history should still be there
    mod = loadFreshModule(tmpDir);
    const fresh = makeFakeIo();
    mod.setupSignboardSocket(fresh.io);
    const browser2 = fresh.connect('browser-2');
    const historyEmits = browser2._emits.filter(([e]) => e === 'signboard:history');
    expect(historyEmits.length).toBeGreaterThan(0);
    const latest = historyEmits[historyEmits.length - 1][1];
    expect(latest[0].text).toBe('persisted');
  });

  test('signboard:done is broadcast to all browsers', () => {
    const mod = loadFreshModule(tmpDir);
    const { io, connect, broadcasts } = makeFakeIo();
    mod.setupSignboardSocket(io);

    const sbSocket = connect('signboard-socket');
    sbSocket._trigger('signboard:status', { connected: true, current_message: null, is_idle: true });
    sbSocket._trigger('signboard:done', {});

    const doneBroadcasts = broadcasts.filter(([e]) => e === 'signboard:done');
    expect(doneBroadcasts.length).toBe(1);
  });
});
