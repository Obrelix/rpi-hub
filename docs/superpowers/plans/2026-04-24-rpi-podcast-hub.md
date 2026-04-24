# rpi-podcast Hub-Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hub-side support for a new managed service `rpi-podcast` — registry entry, Socket.io relay, RSS import helper, dashboard widget, and a dedicated `/podcasts` playlist editor.

**Architecture:** Mirrors the rpi-radio pattern. `rpi-podcast` (separate repo, not in this plan) connects to the hub as a Socket.io client; the hub relays commands and status between it and browsers. New `services/rss.js` fetches and parses RSS/Atom feeds for the "Import RSS" helper. Playlist data lives in `rpi-podcast`; resume positions are URL-keyed.

**Tech Stack:** Node.js, Express, EJS, Socket.io, Jest. One new runtime dependency: `fast-xml-parser`.

**Companion spec:** `docs/superpowers/specs/2026-04-24-rpi-podcast-design.md`.

**Out of scope:** `rpi-podcast` itself (the audio player service). This plan only touches `rpi-hub`.

---

## File Structure

**New files in rpi-hub:**

| Path | Purpose |
|---|---|
| `services/rss.js` | RSS/Atom feed fetcher and parser; URL and size/timeout guards |
| `sockets/podcast.js` | Socket.io relay + in-memory state cache |
| `routes/podcasts.js` | `GET /podcasts` + `POST /podcasts/rss-preview` |
| `views/podcasts.ejs` | Full playlist editor page with sticky now-playing bar and seek slider |
| `public/js/podcast-widget.js` | Dashboard widget client |
| `public/js/podcasts.js` | `/podcasts` page client |
| `tests/services/rss.test.js` | Unit tests for `RssService` |
| `tests/routes/podcasts.test.js` | Integration tests for podcasts routes |
| `tests/fixtures/rss/` | Feed fixtures (three XML files) |

**Modified files in rpi-hub:**

| Path | Change |
|---|---|
| `services.json` | Add `"rpi-podcast"` entry with `group: "led-panel"` |
| `app.js` | Instantiate `RssService`, mount `routes/podcasts.js` |
| `sockets/index.js` | Call `setupPodcastSocket(io)` |
| `views/layout.ejs` | Insert `Podcasts` nav link between `Stations` and `Settings` |
| `views/dashboard.ejs` | Add `#podcast-widget` markup and include script |
| `public/css/style.css` | Append `.podcast-widget`, `.podcast-page`, `.rss-import-modal`, `.seek-slider` rules |
| `package.json` | Add `fast-xml-parser` dependency |
| `tests/routes/dashboard.test.js` | Assert `RPi Podcast` card and `podcast-widget` present |

No changes to `services/systemctl.js`, `services/registry.js`, `services/stats.js`, `services/deploy.js`, `services/wifi.js`, or any other route file.

---

## Task 1: Register rpi-podcast in services.json

**Files:**
- Modify: `services.json`
- Modify: `tests/routes/dashboard.test.js`
- Create: `tests/services/registry-config.test.js`

- [ ] **Step 1: Write the failing tests**

**1a.** In `tests/routes/dashboard.test.js`, extend the existing `GET / returns dashboard with service names` test block (starts at line 76):

```js
test('GET / returns dashboard with service names', async () => {
  const res = await get('/');
  expect(res.status).toBe(200);
  expect(res.body).toContain('RPi Hub');
  expect(res.body).toContain('Maze Battlegrounds');
  expect(res.body).toContain('Voidex');
  expect(res.body).toContain('RPi Podcast');
});
```

**1b.** Create `tests/services/registry-config.test.js` to verify the real `services.json` entry (the pre-existing `registry.test.js` uses a temp-file fixture and doesn't exercise the shipped config):

```js
const path = require('path');
const Registry = require('../../services/registry');

test('services.json contains rpi-podcast with led-panel group', () => {
  const registry = new Registry(path.join(__dirname, '..', '..', 'services.json'));
  const svc = registry.get('rpi-podcast');
  expect(svc).not.toBeNull();
  expect(svc.name).toBe('RPi Podcast');
  expect(svc.unit).toBe('rpi-podcast.service');
  expect(svc.group).toBe('led-panel');
});

test('rpi-podcast conflicts with other led-panel services', () => {
  const registry = new Registry(path.join(__dirname, '..', '..', 'services.json'));
  const conflicts = registry.getConflicting('rpi-podcast').map(c => c.id);
  expect(conflicts).toContain('rpi-radio');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
npm test -- tests/routes/dashboard.test.js tests/services/registry-config.test.js
```

Expected: the dashboard assertion and both registry-config tests fail because `services.json` has no `rpi-podcast` entry.

- [ ] **Step 3: Add the services.json entry**

In `services.json`, insert the following entry between `rpi-signboard` and `rpi-oled` (alphabetical by key is not enforced elsewhere; ordering is cosmetic):

```json
  "rpi-podcast": {
    "name": "RPi Podcast",
    "unit": "rpi-podcast.service",
    "deployPath": "/home/obrelix/rpi-podcast",
    "repo": "https://github.com/Obrelix/rpi-podcast.git",
    "configFile": "/home/obrelix/rpi-podcast/config.json",
    "group": "led-panel",
    "description": "Podcast player with LED title scroller"
  },
```

Ensure the preceding entry ends with a comma and valid JSON syntax is preserved.

- [ ] **Step 4: Run the tests to verify they pass**

```
npm test -- tests/routes/dashboard.test.js tests/services/registry-config.test.js
```

Expected: all assertions pass.

- [ ] **Step 5: Run the full suite**

```
npm test
```

Expected: all pre-existing tests + the new ones pass. The pre-existing `registry.test.js` uses a temp-file fixture and is unaffected.

- [ ] **Step 6: Commit**

```bash
git add services.json tests/routes/dashboard.test.js tests/services/registry-config.test.js
git commit -m "feat(registry): add rpi-podcast service entry"
```

---

## Task 2: Add fast-xml-parser dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (generated)

- [ ] **Step 1: Install the package**

```
npm install fast-xml-parser@^5.0.0 --save
```

This adds the dependency to `package.json` and regenerates `package-lock.json`.

- [ ] **Step 2: Verify install**

```
node -e "const { XMLParser } = require('fast-xml-parser'); console.log(new XMLParser().parse('<a>1</a>'))"
```

Expected output: `{ a: 1 }`.

- [ ] **Step 3: Confirm tests still pass**

```
npm test
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add fast-xml-parser for RSS import"
```

---

## Task 3: RssService — scaffolding and URL validation (TDD)

**Files:**
- Create: `tests/services/rss.test.js`
- Create: `services/rss.js`

- [ ] **Step 1: Write the failing test**

Create `tests/services/rss.test.js` with initial URL validation tests:

```js
const RssService = require('../../services/rss');

describe('RssService.validateUrl', () => {
  const svc = new RssService();

  test('accepts https URL', () => {
    expect(svc.validateUrl('https://example.com/feed.rss')).not.toBeNull();
  });

  test('accepts http URL', () => {
    expect(svc.validateUrl('http://example.com/feed.rss')).not.toBeNull();
  });

  test('rejects file:// scheme', () => {
    expect(svc.validateUrl('file:///etc/passwd')).toBeNull();
  });

  test('rejects ftp scheme', () => {
    expect(svc.validateUrl('ftp://example.com/feed.rss')).toBeNull();
  });

  test('rejects malformed URL', () => {
    expect(svc.validateUrl('not a url')).toBeNull();
  });

  test('rejects localhost', () => {
    expect(svc.validateUrl('http://localhost:3000/feed')).toBeNull();
  });

  test('rejects 127.0.0.1', () => {
    expect(svc.validateUrl('http://127.0.0.1/feed')).toBeNull();
  });

  test('rejects IPv6 loopback', () => {
    expect(svc.validateUrl('http://[::1]/feed')).toBeNull();
  });

  test('rejects 10.x.x.x range', () => {
    expect(svc.validateUrl('http://10.0.0.5/feed')).toBeNull();
  });

  test('rejects 192.168.x.x range', () => {
    expect(svc.validateUrl('http://192.168.1.201/feed')).toBeNull();
  });

  test('rejects 172.16.x.x to 172.31.x.x range', () => {
    expect(svc.validateUrl('http://172.20.0.1/feed')).toBeNull();
  });

  test('rejects 169.254.x.x link-local range', () => {
    expect(svc.validateUrl('http://169.254.1.1/feed')).toBeNull();
  });

  test('accepts a public IPv4', () => {
    expect(svc.validateUrl('http://8.8.8.8/feed')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npm test -- tests/services/rss.test.js
```

Expected: "Cannot find module '../../services/rss'".

- [ ] **Step 3: Write the minimal implementation**

Create `services/rss.js`:

```js
'use strict';

const { URL } = require('url');

class RssService {
  constructor({ timeoutMs = 10000, maxBytes = 5 * 1024 * 1024 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
  }

  validateUrl(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
    const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (v4) {
      const a = parseInt(v4[1], 10);
      const b = parseInt(v4[2], 10);
      if (a === 10) return null;
      if (a === 127) return null;
      if (a === 192 && b === 168) return null;
      if (a === 172 && b >= 16 && b <= 31) return null;
      if (a === 169 && b === 254) return null;
    }
    return url;
  }
}

module.exports = RssService;
```

- [ ] **Step 4: Run the test to verify it passes**

```
npm test -- tests/services/rss.test.js
```

Expected: all `validateUrl` tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/rss.js tests/services/rss.test.js
git commit -m "feat(rss): add RssService with URL validation"
```

---

## Task 4: RssService — duration parsing (TDD)

**Files:**
- Modify: `tests/services/rss.test.js`
- Modify: `services/rss.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/services/rss.test.js`:

```js
describe('RssService.parseDuration', () => {
  const svc = new RssService();

  test('parses plain seconds string', () => {
    expect(svc.parseDuration('5412')).toBe(5412);
  });

  test('parses HH:MM:SS', () => {
    expect(svc.parseDuration('1:30:12')).toBe(5412);
  });

  test('parses MM:SS', () => {
    expect(svc.parseDuration('45:30')).toBe(45 * 60 + 30);
  });

  test('parses with surrounding whitespace', () => {
    expect(svc.parseDuration('  1:30:12  ')).toBe(5412);
  });

  test('returns null for null input', () => {
    expect(svc.parseDuration(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(svc.parseDuration(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(svc.parseDuration('')).toBeNull();
  });

  test('returns null for garbage', () => {
    expect(svc.parseDuration('about an hour')).toBeNull();
  });

  test('returns null for mixed invalid format', () => {
    expect(svc.parseDuration('1:xx:30')).toBeNull();
  });

  test('returns null for too many colon-parts', () => {
    expect(svc.parseDuration('1:2:3:4')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npm test -- tests/services/rss.test.js
```

Expected: `parseDuration is not a function`.

- [ ] **Step 3: Add the method**

In `services/rss.js`, add inside the class body (after `validateUrl`):

```js
  parseDuration(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const parts = s.split(':').map(p => p.trim());
    if (parts.length < 2 || parts.length > 3) return null;
    if (parts.some(p => !/^\d+$/.test(p))) return null;
    if (parts.length === 3) {
      const [h, m, sec] = parts.map(n => parseInt(n, 10));
      return h * 3600 + m * 60 + sec;
    }
    const [m, sec] = parts.map(n => parseInt(n, 10));
    return m * 60 + sec;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```
npm test -- tests/services/rss.test.js
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add services/rss.js tests/services/rss.test.js
git commit -m "feat(rss): parse iTunes duration (HH:MM:SS, MM:SS, seconds)"
```

---

## Task 5: RssService — RSS 2.0 feed parsing (TDD)

**Files:**
- Create: `tests/fixtures/rss/rss2-valid.xml`
- Create: `tests/fixtures/rss/rss2-no-audio.xml`
- Modify: `tests/services/rss.test.js`
- Modify: `services/rss.js`

- [ ] **Step 1: Create RSS 2.0 fixtures**

Create `tests/fixtures/rss/rss2-valid.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Software Unscripted</title>
    <description>A podcast about software.</description>
    <item>
      <title>Ep 142: Rust vs Zig</title>
      <pubDate>Mon, 10 Mar 2025 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep142.mp3" type="audio/mpeg" length="54120000"/>
      <itunes:duration>1:30:12</itunes:duration>
    </item>
    <item>
      <title>Ep 141: Compiler talk</title>
      <pubDate>Mon, 03 Mar 2025 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep141.mp3" type="audio/mpeg" length="48000000"/>
      <itunes:duration>3600</itunes:duration>
    </item>
  </channel>
</rss>
```

Create `tests/fixtures/rss/rss2-no-audio.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>News Blog</title>
    <item>
      <title>Text only post</title>
      <pubDate>Mon, 10 Mar 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/services/rss.test.js` (also add the `fs` and `path` requires at the top of the file):

```js
// Add at top of file:
const fs = require('fs');
const path = require('path');
function fixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'rss', name), 'utf-8');
}

// Append to the file:
describe('RssService.parseFeed (RSS 2.0)', () => {
  const svc = new RssService();

  test('parses valid RSS 2.0 feed with audio enclosures', () => {
    const result = svc.parseFeed(fixture('rss2-valid.xml'));
    expect(result.show).toBe('Software Unscripted');
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toEqual({
      title: 'Ep 142: Rust vs Zig',
      url: 'https://example.com/ep142.mp3',
      duration: 5412,
      pubDate: 'Mon, 10 Mar 2025 12:00:00 GMT',
    });
    expect(result.episodes[1].duration).toBe(3600);
  });

  test('returns empty episode list for feed with no audio enclosures', () => {
    const result = svc.parseFeed(fixture('rss2-no-audio.xml'));
    expect(result.show).toBe('News Blog');
    expect(result.episodes).toEqual([]);
  });

  test('throws on malformed XML', () => {
    expect(() => svc.parseFeed('<not-xml')).toThrow();
  });

  test('throws on XML that is not an RSS or Atom feed', () => {
    expect(() => svc.parseFeed('<?xml version="1.0"?><root><child/></root>')).toThrow(/RSS or Atom/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```
npm test -- tests/services/rss.test.js
```

Expected: `parseFeed is not a function`.

- [ ] **Step 4: Implement parseFeed and parseRss2**

At the top of `services/rss.js`, add the XML parser require:

```js
const { XMLParser } = require('fast-xml-parser');
```

In the constructor, initialize the parser:

```js
  constructor({ timeoutMs = 10000, maxBytes = 5 * 1024 * 1024 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
    });
  }
```

Add methods to the class (after `parseDuration`):

```js
  parseFeed(xmlStr) {
    let doc;
    try {
      doc = this.parser.parse(xmlStr);
    } catch (e) {
      throw new Error('Malformed XML: ' + e.message);
    }
    if (doc && doc.rss && doc.rss.channel) {
      return this.parseRss2(doc.rss.channel);
    }
    if (doc && doc.feed) {
      return this.parseAtom(doc.feed);
    }
    throw new Error('Not an RSS or Atom feed');
  }

  parseRss2(channel) {
    const show = this._textOf(channel.title) || '';
    const rawItems = channel.item;
    const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
    const episodes = [];
    for (const item of items) {
      const enclosure = item.enclosure;
      if (!enclosure || !enclosure.url) continue;
      const type = enclosure.type || '';
      if (type && !type.startsWith('audio/')) continue;
      episodes.push({
        title: this._textOf(item.title) || '(untitled)',
        url: String(enclosure.url),
        duration: this.parseDuration(item['itunes:duration']),
        pubDate: item.pubDate ? String(item.pubDate) : null,
      });
    }
    return { show, episodes };
  }

  parseAtom(feed) {
    // Stub — filled in Task 6
    throw new Error('Not an RSS or Atom feed');
  }

  _textOf(node) {
    if (node == null) return null;
    if (typeof node === 'string') return node;
    if (typeof node === 'object' && node['#text']) return String(node['#text']);
    return null;
  }
```

- [ ] **Step 5: Run the test to verify it passes**

```
npm test -- tests/services/rss.test.js
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add services/rss.js tests/services/rss.test.js tests/fixtures/rss/
git commit -m "feat(rss): parse RSS 2.0 feeds with audio enclosures"
```

---

## Task 6: RssService — Atom feed parsing (TDD)

**Files:**
- Create: `tests/fixtures/rss/atom-valid.xml`
- Modify: `tests/services/rss.test.js`
- Modify: `services/rss.js`

- [ ] **Step 1: Create Atom fixture**

Create `tests/fixtures/rss/atom-valid.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Podcast</title>
  <updated>2025-03-10T12:00:00Z</updated>
  <entry>
    <title>Atom Ep 1</title>
    <published>2025-03-10T12:00:00Z</published>
    <link rel="enclosure" type="audio/mpeg" href="https://example.com/atom-ep1.mp3"/>
  </entry>
  <entry>
    <title>Atom Ep 2</title>
    <updated>2025-03-03T12:00:00Z</updated>
    <link rel="enclosure" type="audio/mpeg" href="https://example.com/atom-ep2.mp3"/>
    <link rel="alternate" type="text/html" href="https://example.com/atom-ep2.html"/>
  </entry>
</feed>
```

- [ ] **Step 2: Write the failing test**

Append to `tests/services/rss.test.js`:

```js
describe('RssService.parseFeed (Atom)', () => {
  const svc = new RssService();

  test('parses Atom feed with audio enclosure links', () => {
    const result = svc.parseFeed(fixture('atom-valid.xml'));
    expect(result.show).toBe('Atom Podcast');
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toEqual({
      title: 'Atom Ep 1',
      url: 'https://example.com/atom-ep1.mp3',
      duration: null,
      pubDate: '2025-03-10T12:00:00Z',
    });
    expect(result.episodes[1]).toEqual({
      title: 'Atom Ep 2',
      url: 'https://example.com/atom-ep2.mp3',
      duration: null,
      pubDate: '2025-03-03T12:00:00Z',
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```
npm test -- tests/services/rss.test.js
```

Expected: the existing stub `parseAtom` throws `Not an RSS or Atom feed`.

- [ ] **Step 4: Implement parseAtom**

Replace the `parseAtom` stub in `services/rss.js` with:

```js
  parseAtom(feed) {
    const show = this._textOf(feed.title) || '';
    const rawEntries = feed.entry;
    const entries = Array.isArray(rawEntries) ? rawEntries : (rawEntries ? [rawEntries] : []);
    const episodes = [];
    for (const entry of entries) {
      const rawLinks = entry.link;
      const links = Array.isArray(rawLinks) ? rawLinks : (rawLinks ? [rawLinks] : []);
      const audio = links.find(l =>
        l && l.rel === 'enclosure' && typeof l.type === 'string' && l.type.startsWith('audio/') && l.href
      );
      if (!audio) continue;
      const pubDate = entry.published || entry.updated || null;
      episodes.push({
        title: this._textOf(entry.title) || '(untitled)',
        url: String(audio.href),
        duration: null,
        pubDate: pubDate ? String(pubDate) : null,
      });
    }
    return { show, episodes };
  }
```

- [ ] **Step 5: Run the test to verify it passes**

```
npm test -- tests/services/rss.test.js
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add services/rss.js tests/services/rss.test.js tests/fixtures/rss/atom-valid.xml
git commit -m "feat(rss): parse Atom feeds with audio enclosure links"
```

---

## Task 7: RssService — fetchAndParse composition

**Files:**
- Modify: `services/rss.js`

No separate unit test — `fetchAndParse` is integration-covered by `tests/routes/podcasts.test.js` in Task 8 (using a mocked `RssService`). Network-layer correctness is exercised manually against a live feed in the final verification task.

- [ ] **Step 1: Add fetchAndParse method**

In `services/rss.js`, add at the top:

```js
const http = require('http');
const https = require('https');
```

Add at the end of the class body:

```js
  fetchAndParse(rawUrl) {
    return new Promise((resolve, reject) => {
      const url = this.validateUrl(rawUrl);
      if (!url) return reject(new Error('Invalid URL'));
      const client = url.protocol === 'https:' ? https : http;
      const req = client.get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > this.maxBytes) {
            req.destroy();
            return reject(new Error('Feed too large'));
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            const xml = Buffer.concat(chunks).toString('utf-8');
            resolve(this.parseFeed(xml));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error('Fetch timeout'));
      });
    });
  }
```

- [ ] **Step 2: Run the test suite to confirm nothing regressed**

```
npm test
```

Expected: green (no new tests added, but existing `rss.test.js` still passes).

- [ ] **Step 3: Commit**

```bash
git add services/rss.js
git commit -m "feat(rss): add fetchAndParse with timeout and size limits"
```

---

## Task 8: /podcasts routes and wiring

**Files:**
- Create: `routes/podcasts.js`
- Create: `tests/routes/podcasts.test.js`
- Modify: `app.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/routes/podcasts.test.js`:

```js
const { createApp } = require('../../app');
const http = require('http');

jest.mock('../../services/systemctl', () => {
  return jest.fn().mockImplementation(() => ({
    getStatus: jest.fn().mockResolvedValue({ active: 'inactive', sub: 'dead', pid: '', since: '' }),
    getAllStatuses: jest.fn().mockResolvedValue({}),
    start: jest.fn().mockResolvedValue(''),
    stop: jest.fn().mockResolvedValue(''),
    restart: jest.fn().mockResolvedValue(''),
    waitForState: jest.fn().mockResolvedValue(undefined),
    getRecentLogs: jest.fn().mockResolvedValue(''),
  }));
});

jest.mock('../../services/stats', () => {
  return jest.fn().mockImplementation(() => ({
    getAll: jest.fn().mockResolvedValue({ cpu: 0, temperature: 0, memory: {}, disk: [] }),
  }));
});

jest.mock('../../services/deploy', () => {
  return jest.fn().mockImplementation(() => ({
    gitPull: jest.fn().mockResolvedValue(''),
    extractUpload: jest.fn().mockResolvedValue(undefined),
    getTmpDir: jest.fn().mockReturnValue('/tmp'),
    cleanup: jest.fn(),
  }));
});

const mockFetchAndParse = jest.fn();
jest.mock('../../services/rss', () => {
  return jest.fn().mockImplementation(() => ({
    fetchAndParse: mockFetchAndParse,
  }));
});

let app, server;

beforeAll((done) => {
  app = createApp();
  app.set('io', { emit: jest.fn() });
  server = http.createServer(app);
  server.listen(0, done);
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  mockFetchAndParse.mockReset();
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const opts = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('GET /podcasts returns the podcasts page', async () => {
  const res = await request('GET', '/podcasts');
  expect(res.status).toBe(200);
  expect(res.body).toContain('Podcasts');
  expect(res.body).toContain('id="pcSeek"');
});

test('POST /podcasts/rss-preview returns episodes when RssService succeeds', async () => {
  mockFetchAndParse.mockResolvedValue({
    show: 'Test Show',
    episodes: [{ title: 'Ep 1', url: 'https://example.com/e1.mp3', duration: 60, pubDate: null }],
  });
  const res = await request('POST', '/podcasts/rss-preview', { feedUrl: 'https://example.com/feed.rss' });
  expect(res.status).toBe(200);
  const data = JSON.parse(res.body);
  expect(data.show).toBe('Test Show');
  expect(data.episodes).toHaveLength(1);
  expect(mockFetchAndParse).toHaveBeenCalledWith('https://example.com/feed.rss');
});

test('POST /podcasts/rss-preview returns 400 when feedUrl is missing', async () => {
  const res = await request('POST', '/podcasts/rss-preview', {});
  expect(res.status).toBe(400);
  expect(mockFetchAndParse).not.toHaveBeenCalled();
});

test('POST /podcasts/rss-preview returns 400 when feedUrl is empty string', async () => {
  const res = await request('POST', '/podcasts/rss-preview', { feedUrl: '' });
  expect(res.status).toBe(400);
});

test('POST /podcasts/rss-preview returns 400 when RssService throws', async () => {
  mockFetchAndParse.mockRejectedValue(new Error('Feed too large'));
  const res = await request('POST', '/podcasts/rss-preview', { feedUrl: 'https://example.com/huge.rss' });
  expect(res.status).toBe(400);
  const data = JSON.parse(res.body);
  expect(data.error).toBe('Feed too large');
});
```

- [ ] **Step 2: Run tests to verify failure**

```
npm test -- tests/routes/podcasts.test.js
```

Expected: fails because `routes/podcasts.js` does not exist yet and `views/podcasts.ejs` will later be required — at this step, Express will 404. The test should report 404 instead of 200, or module-not-found.

- [ ] **Step 3: Create routes/podcasts.js**

```js
const express = require('express');
const router = express.Router();

router.get('/podcasts', (req, res) => {
  res.render('podcasts', {
    pageTitle: 'Podcasts',
    activePage: 'podcasts',
    pageScript: '/js/podcasts.js',
  });
});

router.post('/podcasts/rss-preview', async (req, res) => {
  const feedUrl = req.body && req.body.feedUrl;
  if (typeof feedUrl !== 'string' || !feedUrl.trim()) {
    return res.status(400).json({ error: 'feedUrl required' });
  }
  const rss = req.app.get('rss');
  try {
    const result = await rss.fetchAndParse(feedUrl);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Create a minimal placeholder `views/podcasts.ejs`**

The route's `res.render('podcasts', …)` will fail until the view exists. Create a minimal placeholder to satisfy the route test — it will be fleshed out fully in Task 11.

```html
<%- include('layout') %>

<h1 class="page-title">Podcasts</h1>

<input type="range" id="pcSeek" min="0" max="100" value="0">

<%- include('partials/footer') %>
```

- [ ] **Step 5: Wire RssService and the router in app.js**

Modify `app.js`. After the existing requires, add:

```js
const RssService = require('./services/rss');
```

After the other router requires, add:

```js
const podcastsRouter  = require('./routes/podcasts');
```

In `createApp()`, after the other `app.set(...)` instantiations, add:

```js
  app.set('rss', new RssService());
```

In the router mount section, add (order doesn't matter, but keep it next to `stationsRouter`):

```js
  app.use('/', podcastsRouter);
```

- [ ] **Step 6: Run the tests to verify they pass**

```
npm test -- tests/routes/podcasts.test.js
```

Expected: all 5 new tests pass.

- [ ] **Step 7: Run the full suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add routes/podcasts.js views/podcasts.ejs app.js tests/routes/podcasts.test.js
git commit -m "feat(podcasts): add routes and RssService wiring"
```

---

## Task 9: Socket.io relay for rpi-podcast

**Files:**
- Create: `sockets/podcast.js`
- Modify: `sockets/index.js`

No unit tests for `sockets/podcast.js` — matches the existing decision not to test `sockets/radio.js`. Verification is manual after wiring.

- [ ] **Step 1: Create sockets/podcast.js**

```js
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
```

- [ ] **Step 2: Wire in sockets/index.js**

Modify `sockets/index.js`. Add the require after the other socket requires:

```js
const setupPodcastSocket = require('./podcast');
```

Call it inside `setupSockets` after `setupSignboardSocket(io)`:

```js
  setupPodcastSocket(io);
```

The final file should read:

```js
const { setupStatsBroadcast } = require('./stats');
const { setupLogsSocket } = require('./logs');
const setupRadioSocket = require('./radio');
const setupSignboardSocket = require('./signboard');
const setupPodcastSocket = require('./podcast');

function setupSockets(io, services, config) {
  const statsBroadcast = setupStatsBroadcast(io, services.stats, config.statsIntervalMs);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  setupLogsSocket(io, services.registry);
  setupRadioSocket(io);
  setupSignboardSocket(io);
  setupPodcastSocket(io);

  statsBroadcast.start();
  return { statsBroadcast };
}

module.exports = { setupSockets };
```

- [ ] **Step 3: Manual verification**

Start the hub locally:

```
node server.js
```

In a separate terminal, open `http://localhost:3000/` and confirm the existing dashboard still renders and no console errors appear. Kill the server with Ctrl+C.

Runtime verification of `podcast:*` events requires a matching `rpi-podcast` client, which does not exist yet — covered in the final verification task against the Pi.

- [ ] **Step 4: Run the test suite**

```
npm test
```

Expected: all tests pass. No new tests were added.

- [ ] **Step 5: Commit**

```bash
git add sockets/podcast.js sockets/index.js
git commit -m "feat(sockets): add podcast relay mirroring radio pattern"
```

---

## Task 10: Add Podcasts nav link

**Files:**
- Modify: `views/layout.ejs`

- [ ] **Step 1: Insert the nav link**

In `views/layout.ejs`, find the `<ul class="nav-links">` block (lines 14–21). Insert a new `<li>` between the `stations` link and the `settings` link:

```html
      <li><a href="/stations" class="<%= activePage === 'stations' ? 'active' : '' %>">Stations</a></li>
      <li><a href="/podcasts" class="<%= activePage === 'podcasts' ? 'active' : '' %>">Podcasts</a></li>
      <li><a href="/settings"class="<%= activePage === 'settings'  ? 'active' : '' %>">Settings</a></li>
```

- [ ] **Step 2: Manual verification**

Start the server:

```
node server.js
```

Navigate to `http://localhost:3000/`. Confirm:
- The nav shows `Dashboard | Logs | System | Deploy | Stations | Podcasts | Settings`.
- Clicking `Podcasts` loads the placeholder page (from Task 8) with the title `Podcasts` and the `Podcasts` link is highlighted as active.
- Clicking `Stations` still works and its link is active on that page.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add views/layout.ejs
git commit -m "feat(layout): add Podcasts nav link"
```

---

## Task 11: /podcasts page markup

**Files:**
- Modify: `views/podcasts.ejs`

Replaces the Task 8 placeholder with the full page.

- [ ] **Step 1: Replace the file contents**

Overwrite `views/podcasts.ejs` with:

```html
<%- include('layout') %>

<!-- ── Now Playing Bar ──────────────────────────────────────────── -->
<div class="now-playing-bar podcast-now-playing" id="pcNowPlayingBar">
  <div class="np-controls">
    <button class="np-btn" id="pcPrev" title="Previous">&#x23EE;</button>
    <button class="np-btn" id="pcPlayPause" title="Play/Pause">&#x25B6;</button>
    <button class="np-btn" id="pcNext" title="Next">&#x23ED;</button>
  </div>
  <div class="np-info">
    <div class="np-station" id="pcShow">No episode</div>
    <div class="np-track" id="pcEpisode"></div>
    <div class="np-meta"><span id="pcPos">0:00</span> / <span id="pcDur">0:00</span></div>
  </div>
  <div class="np-seek seek-slider">
    <input type="range" id="pcSeek" min="0" max="100" value="0" step="1" disabled>
  </div>
  <div class="np-volume">
    <label>Vol</label>
    <input type="range" id="pcVolume" min="0" max="150" value="70">
    <span class="np-volume-val" id="pcVolumeVal">70%</span>
  </div>
  <span class="status-badge stopped" id="pcStatusBadge">Offline</span>
</div>

<!-- ── Toolbar ──────────────────────────────────────────────────── -->
<div class="station-toolbar">
  <div class="toolbar-left">
    <h1 class="page-title">Podcasts</h1>
    <span class="text-muted" id="episodeCount">0 episodes</span>
  </div>
  <div class="toolbar-right">
    <button class="btn btn-secondary btn-sm" id="importRss">Import RSS</button>
    <label class="btn btn-secondary btn-sm">
      Import CSV
      <input type="file" id="importCsv" accept=".csv,.txt,.tsv" hidden>
    </label>
    <button class="btn btn-secondary btn-sm" id="exportCsv">Export CSV</button>
    <button class="btn btn-success btn-sm" id="addEpisode">+ Add Episode</button>
    <button class="btn btn-danger btn-sm" id="removeSelected" disabled>Remove Selected</button>
    <button class="btn btn-primary btn-sm" id="saveEpisodes">Save</button>
  </div>
</div>

<!-- ── Episode Table ─────────────────────────────────────────────── -->
<div class="station-table-wrap">
  <table class="station-table" id="episodeTable">
    <thead>
      <tr>
        <th class="col-drag"></th>
        <th class="col-num">#</th>
        <th class="col-check"><input type="checkbox" id="selectAll" title="Select all"></th>
        <th class="col-play"></th>
        <th class="col-name">Name</th>
        <th class="col-url">URL</th>
        <th class="col-genre">Show</th>
        <th class="col-genre">Duration</th>
      </tr>
    </thead>
    <tbody id="episodeBody"></tbody>
  </table>
  <div class="station-status-bar">
    <span id="statusText">0 episodes</span>
    <span>Click name, URL, or show to edit inline</span>
  </div>
</div>

<!-- ── RSS Import Modal ─────────────────────────────────────────── -->
<div class="rss-import-modal" id="rssImportModal" hidden>
  <div class="rss-import-inner">
    <header class="rss-import-header">
      <h3>Import from RSS Feed</h3>
      <button type="button" class="rss-close" id="rssClose" title="Close">&times;</button>
    </header>
    <div class="rss-input-row">
      <input type="url" id="rssFeedUrl" placeholder="https://example.com/podcast.rss">
      <button class="btn btn-primary btn-sm" id="rssFetchBtn">Fetch</button>
    </div>
    <div class="rss-status" id="rssStatus"></div>
    <div class="rss-result" id="rssResult" hidden>
      <h4 id="rssShowName"></h4>
      <div class="rss-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="rssSelectAll">Select All</button>
        <button type="button" class="btn btn-success btn-sm" id="rssAddSelected">Add Selected</button>
      </div>
      <ul class="rss-episodes" id="rssEpisodes"></ul>
    </div>
  </div>
</div>

<%- include('partials/footer') %>
```

- [ ] **Step 2: Run the test suite**

```
npm test -- tests/routes/podcasts.test.js
```

Expected: the `GET /podcasts` test still passes (it checks for the `id="pcSeek"` marker which is still present).

- [ ] **Step 3: Manual verification**

Start the server, visit `http://localhost:3000/podcasts`, confirm:
- Sticky now-playing bar at the top with play controls, seek slider (disabled), volume, status badge (Offline).
- Toolbar with `Import RSS | Import CSV | Export CSV | + Add Episode | Remove Selected | Save`.
- Empty table with headers `# | (checkbox) | (play) | Name | URL | Show | Duration`.
- Status bar shows `0 episodes`.
- No JS errors (no behavior wired yet; Task 12+ adds it).

- [ ] **Step 4: Commit**

```bash
git add views/podcasts.ejs
git commit -m "feat(podcasts): build /podcasts page markup"
```

---

## Task 12: /podcasts client JS — scaffold, socket listeners, render

**Files:**
- Create: `public/js/podcasts.js`

- [ ] **Step 1: Create the base client file**

```js
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
```

- [ ] **Step 2: Manual verification**

Start the server, visit `http://localhost:3000/podcasts`. Confirm:
- Page loads with no JS console errors.
- Status badge shows `Offline` (rpi-podcast not connected).
- Episode count shows `0 episodes`.
- Seek slider is disabled (no duration known).
- No episodes render in the table.

- [ ] **Step 3: Commit**

```bash
git add public/js/podcasts.js
git commit -m "feat(podcasts): client scaffold with socket listeners and render"
```

---

## Task 13: /podcasts client JS — play controls and seek

**Files:**
- Modify: `public/js/podcasts.js`

- [ ] **Step 1: Add play controls and seek event handlers**

Insert the following block into `public/js/podcasts.js` immediately before the `// ── Init ──────────────` section:

```js
  // ── Now Playing Bar controls ───────────────────────────────────
  pcPlayPause.addEventListener('click', function () {
    if (!podcastState.connected) { showToast('Podcast service is offline', 'warning'); return; }
    socket.emit(podcastState.is_playing ? 'podcast:pause' : 'podcast:play', {});
  });
  pcPrev.addEventListener('click', function () {
    if (!podcastState.connected) { showToast('Podcast service is offline', 'warning'); return; }
    socket.emit('podcast:prev', {});
  });
  pcNext.addEventListener('click', function () {
    if (!podcastState.connected) { showToast('Podcast service is offline', 'warning'); return; }
    socket.emit('podcast:next', {});
  });

  var volumeTimeout;
  pcVolume.addEventListener('input', function () {
    pcVolumeVal.textContent = pcVolume.value + '%';
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(function () {
      socket.emit('podcast:volume', { volume: parseInt(pcVolume.value, 10) });
    }, 100);
  });

  // ── Seek slider ────────────────────────────────────────────────
  pcSeek.addEventListener('mousedown', function () { isSeeking = true; });
  pcSeek.addEventListener('touchstart', function () { isSeeking = true; });
  pcSeek.addEventListener('input', function () {
    pcPos.textContent = fmtTime(parseInt(pcSeek.value, 10));
  });
  pcSeek.addEventListener('change', function () {
    if (!podcastState.connected) { isSeeking = false; return; }
    var pos = parseInt(pcSeek.value, 10);
    if (isFinite(pos) && pos >= 0) {
      socket.emit('podcast:seek', { position: pos });
      positionInfo.position = pos;
    }
    isSeeking = false;
  });

  // ── Play button per row ────────────────────────────────────────
  tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('.station-play-btn');
    if (!btn) return;
    if (!podcastState.connected) { showToast('Podcast service is offline', 'warning'); return; }

    var tr = btn.closest('tr');
    var idx = parseInt(tr.dataset.index, 10);

    if (hasChanges) {
      doSave(function () {
        socket.emit('podcast:play', { index: idx });
      });
    } else {
      socket.emit('podcast:play', { index: idx });
    }
  });

  function doSave(callback) {
    if (!podcastState.connected) { showToast('Podcast service is offline', 'warning'); return; }
    socket.emit('podcast:playlist-update', playlist);
    showToast('Playlist saved', 'success');
    if (callback) {
      socket.once('podcast:playlist', function () { callback(); });
    }
  }
```

Leave `doSave` here so later tasks can call it without redeclaration.

- [ ] **Step 2: Manual verification**

Start the server, visit `/podcasts`. Confirm (without rpi-podcast connected):
- Clicking play/prev/next shows "Podcast service is offline" toast.
- Volume slider updates the `%` label visually.
- Seek slider is disabled (no duration).
- Row play buttons show the offline toast when clicked.

- [ ] **Step 3: Commit**

```bash
git add public/js/podcasts.js
git commit -m "feat(podcasts): wire play/prev/next/volume/seek controls"
```

---

## Task 14: /podcasts client JS — inline edit, add, remove, drag-reorder, save

**Files:**
- Modify: `public/js/podcasts.js`

- [ ] **Step 1: Add editing/selection/save logic**

Insert the following block immediately before the `// ── Init ──────────────` section (after the Task 13 insertions):

```js
  // ── Inline editing ─────────────────────────────────────────────
  tbody.addEventListener('dblclick', function (e) {
    var cell = e.target.closest('.station-name-cell, .station-url-cell, .station-genre-cell');
    if (!cell || cell.querySelector('input')) return;

    var tr = cell.closest('tr');
    var idx = parseInt(tr.dataset.index, 10);
    var field = cell.classList.contains('station-name-cell') ? 'name' :
                cell.classList.contains('station-url-cell')  ? 'url'  : 'show';
    var oldValue = playlist[idx][field] || '';

    var input = document.createElement('input');
    input.type = 'text';
    input.value = oldValue;
    input.className = 'editing' + (field === 'url' ? ' url-input' : '');
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      playlist[idx][field] = input.value.trim();
      renderTable();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { input.blur(); }
      if (ev.key === 'Escape') { playlist[idx][field] = oldValue; renderTable(); }
    });
  });

  // ── Select / remove ────────────────────────────────────────────
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

  addBtn.addEventListener('click', function () {
    playlist.push({ name: '', url: '', duration: null, show: '' });
    renderTable();
    var lastRow = tbody.lastElementChild;
    if (lastRow) {
      var nameCell = lastRow.querySelector('.station-name-cell');
      if (nameCell) nameCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
  });

  removeBtn.addEventListener('click', function () {
    var cbs = tbody.querySelectorAll('input[type="checkbox"]:checked');
    if (cbs.length === 0) return;

    var indices = [];
    cbs.forEach(function (cb) {
      var tr = cb.closest('tr');
      indices.push(parseInt(tr.dataset.index, 10));
    });

    var names = indices.map(function (i) { return playlist[i].name || '(unnamed)'; }).join(', ');
    if (!confirm('Remove ' + indices.length + ' episode(s)?\n\n' + names)) return;

    indices.sort(function (a, b) { return b - a; });
    indices.forEach(function (i) { playlist.splice(i, 1); });

    selectAllCb.checked = false;
    renderTable();
  });

  // ── Save ───────────────────────────────────────────────────────
  saveBtn.addEventListener('click', function () { doSave(); });

  // ── Drag and Drop reorder ──────────────────────────────────────
  var dragSrcIdx = null;

  tbody.addEventListener('dragstart', function (e) {
    var handle = e.target.closest('.drag-handle');
    if (!handle) { e.preventDefault(); return; }
    var tr = handle.closest('tr');
    dragSrcIdx = parseInt(tr.dataset.index, 10);
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

    var dropIdx = parseInt(tr.dataset.index, 10);
    if (dragSrcIdx === dropIdx) return;

    var moved = playlist.splice(dragSrcIdx, 1)[0];
    playlist.splice(dropIdx, 0, moved);
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
```

- [ ] **Step 2: Manual verification**

Start the server, visit `/podcasts`:
- Click `+ Add Episode` — new blank row appears with inline editor open on the name field.
- Type a name, press Enter — edits commit, `Save` button shows `Save *` (dirty marker).
- Double-click the URL cell, type a URL, press Enter — edits commit.
- Click the row's checkbox, then `Remove Selected` — confirm dialog appears, row removes on accept.
- Add two rows, drag the handle of the second row onto the first — rows reorder.
- Clicking `Save` shows the offline toast (rpi-podcast not connected).

- [ ] **Step 3: Commit**

```bash
git add public/js/podcasts.js
git commit -m "feat(podcasts): inline edit, add/remove, drag-reorder, save"
```

---

## Task 15: /podcasts client JS — CSV import and export

**Files:**
- Modify: `public/js/podcasts.js`

- [ ] **Step 1: Add CSV handlers**

Insert the following block immediately before the `// ── Init ──────────────` section (after the Task 14 insertions):

```js
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
          var durRaw = (parts[3] || '').trim();
          var dur = /^\d+$/.test(durRaw) ? parseInt(durRaw, 10) : null;
          playlist.push({
            name: parts[0].trim(),
            url: parts[1].trim(),
            show: (parts[2] || '').trim(),
            duration: dur,
          });
          imported++;
        }
      });
      if (imported > 0) {
        renderTable();
        showToast('Imported ' + imported + ' episode(s)', 'success');
      } else {
        showToast('No valid episodes found in file', 'warning');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  // ── CSV Export ─────────────────────────────────────────────────
  exportBtn.addEventListener('click', function () {
    var csv = playlist.map(function (ep) {
      return [ep.name, ep.url, ep.show || '', ep.duration == null ? '' : ep.duration].join('\t');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/tab-separated-values' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'podcasts.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
```

CSV format: tab-separated, 4 columns per line: `name\turl\tshow\tduration_seconds`. Matches the stations convention (which uses 3 columns: name/url/genre).

- [ ] **Step 2: Manual verification**

Add two rows via the UI. Click `Export CSV` → `podcasts.csv` downloads. Open it in a text editor: 2 tab-separated lines. Click `Import CSV` and select the same file: 2 more rows appear (original + re-imported).

- [ ] **Step 3: Commit**

```bash
git add public/js/podcasts.js
git commit -m "feat(podcasts): CSV import/export"
```

---

## Task 16: /podcasts client JS — RSS import modal

**Files:**
- Modify: `public/js/podcasts.js`

- [ ] **Step 1: Add RSS modal handlers**

Insert the following block immediately before the `// ── Init ──────────────` section (after the Task 15 insertions):

```js
  // ── RSS Import Modal ───────────────────────────────────────────
  var rssModal     = document.getElementById('rssImportModal');
  var rssClose     = document.getElementById('rssClose');
  var rssFeedUrl   = document.getElementById('rssFeedUrl');
  var rssFetchBtn  = document.getElementById('rssFetchBtn');
  var rssStatus    = document.getElementById('rssStatus');
  var rssResult    = document.getElementById('rssResult');
  var rssShowName  = document.getElementById('rssShowName');
  var rssEpisodes  = document.getElementById('rssEpisodes');
  var rssSelectAll = document.getElementById('rssSelectAll');
  var rssAddBtn    = document.getElementById('rssAddSelected');

  var rssCurrent = { show: '', episodes: [] };

  function openRssModal() {
    rssStatus.textContent = '';
    rssResult.hidden = true;
    rssFeedUrl.value = '';
    rssEpisodes.innerHTML = '';
    rssCurrent = { show: '', episodes: [] };
    rssModal.hidden = false;
    rssFeedUrl.focus();
  }

  function closeRssModal() {
    rssModal.hidden = true;
  }

  importRssBtn.addEventListener('click', openRssModal);
  rssClose.addEventListener('click', closeRssModal);
  rssModal.addEventListener('click', function (e) {
    if (e.target === rssModal) closeRssModal();
  });

  rssFetchBtn.addEventListener('click', function () {
    var url = rssFeedUrl.value.trim();
    if (!url) { rssStatus.textContent = 'Enter a feed URL.'; return; }
    rssStatus.textContent = 'Fetching…';
    rssResult.hidden = true;

    fetch('/podcasts/rss-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl: url }),
    })
      .then(function (r) {
        return r.json().then(function (body) { return { status: r.status, body: body }; });
      })
      .then(function (res) {
        if (res.status !== 200) {
          rssStatus.textContent = 'Error: ' + (res.body && res.body.error || 'request failed');
          return;
        }
        rssCurrent = { show: res.body.show || '', episodes: res.body.episodes || [] };
        rssStatus.textContent = rssCurrent.episodes.length + ' episode(s) found.';
        rssShowName.textContent = rssCurrent.show || '(unnamed feed)';
        rssEpisodes.innerHTML = '';
        rssCurrent.episodes.forEach(function (ep, i) {
          var li = document.createElement('li');
          li.innerHTML =
            '<label>' +
              '<input type="checkbox" data-index="' + i + '">' +
              '<span class="rss-ep-title">' + escapeHtml(ep.title) + '</span>' +
              '<span class="rss-ep-meta">' +
                (ep.pubDate ? escapeHtml(ep.pubDate) : '') +
                (ep.duration ? ' · ' + fmtTime(ep.duration) : '') +
              '</span>' +
            '</label>';
          rssEpisodes.appendChild(li);
        });
        rssResult.hidden = false;
      })
      .catch(function (err) {
        rssStatus.textContent = 'Network error: ' + err.message;
      });
  });

  rssSelectAll.addEventListener('click', function () {
    var cbs = rssEpisodes.querySelectorAll('input[type="checkbox"]');
    var allChecked = Array.prototype.every.call(cbs, function (cb) { return cb.checked; });
    cbs.forEach(function (cb) { cb.checked = !allChecked; });
  });

  rssAddBtn.addEventListener('click', function () {
    var cbs = rssEpisodes.querySelectorAll('input[type="checkbox"]:checked');
    if (cbs.length === 0) { rssStatus.textContent = 'Select at least one episode.'; return; }
    var added = 0;
    cbs.forEach(function (cb) {
      var i = parseInt(cb.dataset.index, 10);
      var ep = rssCurrent.episodes[i];
      if (!ep) return;
      playlist.push({
        name: ep.title || '(untitled)',
        url: ep.url,
        duration: ep.duration == null ? null : ep.duration,
        show: rssCurrent.show || '',
      });
      added++;
    });
    renderTable();
    showToast('Added ' + added + ' episode(s) from RSS', 'success');
    closeRssModal();
  });
```

- [ ] **Step 2: Manual verification**

Start the server, visit `/podcasts`:
- Click `Import RSS` — modal appears with input field.
- Enter an invalid URL (e.g., `not a url`) → click `Fetch` → `Error: Invalid URL` shown.
- Enter a reachable public podcast feed (e.g., `https://feeds.npr.org/381444908/podcast.xml`) → click `Fetch` → list of episodes appears with checkboxes.
- Click `Select All` → all checkboxes toggle.
- Check 2 episodes → click `Add Selected` → modal closes, 2 rows appear in the playlist table with `Show` and `Duration` populated, Save button shows `Save *`.
- Click the `×` close button — modal hides without adding anything.

- [ ] **Step 3: Commit**

```bash
git add public/js/podcasts.js
git commit -m "feat(podcasts): RSS import modal"
```

---

## Task 17: Dashboard widget markup

**Files:**
- Modify: `views/dashboard.ejs`
- Modify: `tests/routes/dashboard.test.js`

- [ ] **Step 1: Write the failing test**

Add a new test to `tests/routes/dashboard.test.js` after the existing signboard widget test (around line 90):

```js
test('GET / renders podcast widget and loads podcast-widget.js', async () => {
  const res = await get('/');
  expect(res.status).toBe(200);
  expect(res.body).toContain('podcast-widget');
  expect(res.body).toContain('podcast-widget.js');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npm test -- tests/routes/dashboard.test.js
```

Expected: the new assertion fails with "Expected substring: 'podcast-widget'".

- [ ] **Step 3: Add the widget markup**

In `views/dashboard.ejs`, insert the following block between the signboard widget (ending around line 149, `</div>` closing `signboard-widget`) and the services grid heading (line 152, `Services`):

```html
<!-- ── Podcast Control Widget ────────────────────────────────────── -->
<div class="podcast-widget" id="podcast-widget">
  <div class="podcast-header" role="button" tabindex="0" aria-expanded="false">
    <h3>RPi Podcast</h3>
    <span class="podcast-status-badge stopped">Offline</span>
    <button class="widget-collapse-toggle" type="button" aria-label="Toggle widget" aria-expanded="false">&#x25BE;</button>
  </div>
  <div class="widget-summary"></div>
  <div class="widget-body">
    <div class="podcast-now-playing">
      <div class="podcast-show-name">No episode</div>
      <div class="podcast-episode-name"></div>
      <div class="podcast-position"></div>
    </div>
    <div class="podcast-transport">
      <button class="podcast-prev" title="Previous">&#x23EE;</button>
      <button class="podcast-play-pause" title="Play/Pause">&#x25B6;</button>
      <button class="podcast-next" title="Next">&#x23ED;</button>
    </div>
    <div class="podcast-volume-row">
      <label>Volume</label>
      <input type="range" class="podcast-volume" min="0" max="150" value="70">
      <span class="podcast-volume-label">70%</span>
    </div>
    <div class="podcast-selectors">
      <div>
        <label>Episode</label>
        <div class="podcast-episode-row">
          <select class="podcast-episode-select"></select>
        </div>
      </div>
    </div>
  </div>
</div>
```

In the same file, locate the closing script block at the bottom (after `<%- include('partials/footer') %>`) and add the widget script include:

```html
<%- include('partials/footer') %>
<script src="/js/widget-collapse.js"></script>
<script src="/js/radio-widget.js"></script>
<script src="/js/signboard-widget.js"></script>
<script src="/js/podcast-widget.js"></script>
```

Note: the podcast widget script must load **after** `widget-collapse.js` so the `window.setWidgetSummary` helper is available.

- [ ] **Step 4: Run the tests to verify they pass**

```
npm test -- tests/routes/dashboard.test.js
```

Expected: all dashboard tests pass, including the new podcast-widget assertion. Note that the widget script `/js/podcast-widget.js` does not exist yet — the test only checks the HTML references it. The browser would 404 on the script load until Task 18, but no test covers that.

- [ ] **Step 5: Commit**

```bash
git add views/dashboard.ejs tests/routes/dashboard.test.js
git commit -m "feat(dashboard): add podcast widget markup"
```

---

## Task 18: Dashboard widget client script + widget-collapse registration

**Files:**
- Create: `public/js/podcast-widget.js`
- Modify: `public/js/widget-collapse.js`

The existing `widget-collapse.js` holds a hardcoded `WIDGETS` array (radio + signboard). Add an entry for the podcast widget so the header toggle, collapsed-state persistence, and `setWidgetSummary` helper all work.

- [ ] **Step 1: Register the widget in widget-collapse.js**

In `public/js/widget-collapse.js`, extend the `WIDGETS` array:

```js
  const WIDGETS = [
    {
      root: '#radio-widget',
      header: '.radio-header',
      storageKey: 'widget-collapsed:radio'
    },
    {
      root: '#signboard-widget',
      header: '.signboard-header',
      storageKey: 'widget-collapsed:signboard'
    },
    {
      root: '#podcast-widget',
      header: '.podcast-header',
      storageKey: 'widget-collapsed:podcast'
    }
  ];
```

- [ ] **Step 2: Create the widget client**

```js
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
    volumeSlider.value = podcastState.volume;
    volumeLabel.textContent = podcastState.volume + '%';
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
    podcastState = data || podcastState;
    updateStatus();
  });

  socket.on('podcast:now-playing', function (data) {
    nowPlaying = data || nowPlaying;
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
    volumeLabel.textContent = volumeSlider.value + '%';
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(function () {
      socket.emit('podcast:volume', { volume: parseInt(volumeSlider.value, 10) });
    }, 100);
  });

  episodeSelect.addEventListener('change', function () {
    socket.emit('podcast:play', { index: parseInt(episodeSelect.value, 10) });
  });

  updateStatus();
  updateNowPlaying();
})();
```

- [ ] **Step 3: Manual verification**

Start the server, visit `/`:
- Podcast widget renders with `Offline` badge.
- Show name displays `No episode`, position line empty or `0:00`.
- Volume slider functional (label updates as you drag).
- Clicking the widget header toggles collapse (matching radio/signboard behavior via `widget-collapse.js`). The collapsed state persists via `localStorage` key `widget-collapsed:podcast`.
- No JS console errors.

- [ ] **Step 4: Commit**

```bash
git add public/js/podcast-widget.js public/js/widget-collapse.js
git commit -m "feat(dashboard): add podcast widget client script"
```

---

## Task 19: CSS styling

**Files:**
- Modify: `public/css/style.css`

No tests. Manual visual verification only.

- [ ] **Step 1: Read existing widget styles for reference**

Before editing, note the existing patterns in `public/css/style.css` for `.radio-widget`, `.signboard-widget`, `.station-table`, and the `.now-playing-bar` block. The new rules reuse the same color tokens (`--bg-secondary`, `--accent`, `--border-color`, etc.) and spacing.

- [ ] **Step 2: Append the new rules**

Append the following block at the end of `public/css/style.css`:

```css
/* ── Podcast Widget ─────────────────────────────────────────────── */
.podcast-widget {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}
.podcast-widget.podcast-offline { opacity: 0.75; }
.podcast-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}
.podcast-header h3 {
  margin: 0;
  font-size: 1rem;
  flex: 1;
}
.podcast-status-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
}
.podcast-status-badge.running { background: var(--success); color: #fff; }
.podcast-status-badge.stopped { background: var(--bg-primary); color: var(--text-muted); border: 1px solid var(--border-color); }
.podcast-now-playing { margin: 0.5rem 0; }
.podcast-show-name { font-weight: 600; }
.podcast-episode-name { font-size: 0.9rem; color: var(--text-muted); }
.podcast-position { font-size: 0.8rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.podcast-transport {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.podcast-transport button {
  flex: 1;
  padding: 0.4rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}
.podcast-transport button:hover { background: var(--bg-secondary); filter: brightness(1.25); }
.podcast-volume-row,
.podcast-selectors {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.podcast-volume-row label,
.podcast-selectors label {
  min-width: 64px;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.podcast-volume { flex: 1; }
.podcast-volume-label {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.podcast-episode-row { flex: 1; display: flex; }
.podcast-episode-select {
  flex: 1;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
}

/* ── Podcast Page — Now-Playing Bar extension ───────────────────── */
.podcast-now-playing .np-seek {
  flex: 2;
  display: flex;
  align-items: center;
}
.seek-slider input[type="range"] {
  width: 100%;
}
.seek-slider input[type="range"]:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── RSS Import Modal ───────────────────────────────────────────── */
.rss-import-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.rss-import-modal[hidden] { display: none; }
.rss-import-inner {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  width: min(640px, 100%);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rss-import-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
}
.rss-import-header h3 {
  margin: 0;
  flex: 1;
  font-size: 1rem;
}
.rss-close {
  background: transparent;
  color: var(--text-muted);
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0 0.5rem;
}
.rss-close:hover { color: var(--text-primary); }
.rss-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}
.rss-input-row input[type="url"] {
  flex: 1;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-size: 0.9rem;
}
.rss-status {
  padding: 0 1rem 0.5rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  min-height: 1.2rem;
}
.rss-result {
  padding: 0 1rem 1rem;
  overflow-y: auto;
}
.rss-result h4 {
  margin: 0.25rem 0 0.5rem;
}
.rss-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.rss-episodes {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.rss-episodes li {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border-color);
}
.rss-episodes li:last-child { border-bottom: none; }
.rss-episodes label {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  cursor: pointer;
}
.rss-ep-title { flex: 1; }
.rss-ep-meta { color: var(--text-muted); font-size: 0.8rem; }
```

Variable names used above are all defined in `:root` in `public/css/style.css`: `--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-muted`, `--border-color`, `--success`, `--accent`, `--accent-hover`, `--success-hover`. The hover effect on transport buttons uses `filter: brightness(1.25)` over `--bg-secondary` because there is no `--bg-hover` token.

- [ ] **Step 3: Manual verification**

Start the server, visit `/` and `/podcasts`:
- Dashboard: podcast widget has rounded border, dark background matching radio/signboard widgets. Status badge styled. Volume slider and episode select styled.
- /podcasts page: now-playing bar spans full width, seek slider stretches across the bar, disabled when offline.
- Click `Import RSS`: modal appears centered over dimmed background, input + Fetch button, scrollable episode list area.

- [ ] **Step 4: Commit**

```bash
git add public/css/style.css
git commit -m "style(podcast): widget, page, and RSS import modal"
```

---

## Task 20: Full verification

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

```
npm test
```

Expected: all pre-existing tests (29) plus the new RSS service tests (~21 cases across validateUrl, parseDuration, parseRss2, parseAtom) plus podcasts route tests (5) plus the extended dashboard tests (2 new assertions) — total ≈ 55+ tests, all passing. On Windows **and** a Pi-equivalent Linux host (same platform-agnostic guarantee as the existing suite).

- [ ] **Step 2: Start the hub locally and walk the happy path (no rpi-podcast)**

```
node server.js
```

Check in a browser:
- `/` — dashboard renders with the podcast widget showing Offline.
- `/podcasts` — page loads, now-playing bar shows Offline, table empty, toolbar buttons present.
- Click `Import RSS`, enter a real feed URL (`https://feeds.npr.org/381444908/podcast.xml`), click `Fetch`. Expect episode list.
- Check two episodes, click `Add Selected`. Expect rows appear.
- `Save` shows the offline toast because rpi-podcast is not connected.
- `Export CSV` downloads a file with the two rows.
- Add a row manually via `+ Add Episode`, edit name/URL/show inline. Drag rows to reorder.
- Check a row, `Remove Selected` with confirm.

- [ ] **Step 3: Deploy-time smoke checklist (document only; runs on the Pi)**

The following should be verified once rpi-podcast exists and is deployed. Not part of this plan's acceptance — included for the feature owner.

- [ ] Deploy rpi-hub to the Pi via the existing `scp`/`ssh` flow in CLAUDE.md.
- [ ] `sudo systemctl restart rpi-hub`.
- [ ] Hit `http://192.168.1.201:3000/` from a LAN device.
- [ ] When rpi-podcast is running, the widget shows `Playing`/`Paused`, not `Offline`.
- [ ] Starting rpi-podcast while rpi-radio is running stops rpi-radio (group mutex via `led-panel`).
- [ ] Playing an episode, pausing mid-way, then clicking play again resumes at the same position.
- [ ] Seeking via the slider on `/podcasts` jumps the audio.
- [ ] Unplugging network from the Pi and replugging reconnects the widget without a page reload.

- [ ] **Step 4: Final commit (if anything adjusted during verification)**

If verification turned up issues, fix them and commit per task-appropriate messages. If nothing changed, no commit needed here.

---

## Summary of commits this plan produces

1. `feat(registry): add rpi-podcast service entry`
2. `chore(deps): add fast-xml-parser for RSS import`
3. `feat(rss): add RssService with URL validation`
4. `feat(rss): parse iTunes duration (HH:MM:SS, MM:SS, seconds)`
5. `feat(rss): parse RSS 2.0 feeds with audio enclosures`
6. `feat(rss): parse Atom feeds with audio enclosure links`
7. `feat(rss): add fetchAndParse with timeout and size limits`
8. `feat(podcasts): add routes and RssService wiring`
9. `feat(sockets): add podcast relay mirroring radio pattern`
10. `feat(layout): add Podcasts nav link`
11. `feat(podcasts): build /podcasts page markup`
12. `feat(podcasts): client scaffold with socket listeners and render`
13. `feat(podcasts): wire play/prev/next/volume/seek controls`
14. `feat(podcasts): inline edit, add/remove, drag-reorder, save`
15. `feat(podcasts): CSV import/export`
16. `feat(podcasts): RSS import modal`
17. `feat(dashboard): add podcast widget markup`
18. `feat(dashboard): add podcast widget client script`
19. `style(podcast): widget, page, and RSS import modal`

20 tasks, 19 commits (Task 20 is verification-only).
