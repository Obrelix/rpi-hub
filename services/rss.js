'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { XMLParser } = require('fast-xml-parser');

class RssService {
  constructor({ timeoutMs = 10000, maxBytes = 5 * 1024 * 1024 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
      parseTagValue: false,
      parseAttributeValue: false,
    });
  }

  validateUrl(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return null;
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
    // Reject IPv4-mapped IPv6 addresses (bypass attempt for private-range guards)
    if (host.includes('::ffff:')) return null;
    return url;
  }

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

  _textOf(node) {
    if (node == null) return null;
    if (typeof node === 'string') return node;
    if (typeof node === 'number' || typeof node === 'boolean') return String(node);
    if (typeof node === 'object' && node['#text'] != null) return String(node['#text']);
    return null;
  }

  /**
   * Fetch an RSS/Atom feed and parse it.
   *
   * Security notes:
   * - URL is validated via `validateUrl` (rejects non-http(s), loopback,
   *   private IPv4 ranges, IPv4-mapped IPv6).
   * - Fetch is bounded by `timeoutMs` (default 10s) and `maxBytes`
   *   (default 5 MiB) to prevent resource exhaustion.
   * - Known gap: DNS rebinding. `validateUrl` inspects the hostname
   *   string, but DNS resolution happens inside `http.get` — an attacker-
   *   controlled DNS server can return a public IP at validation time and
   *   a private IP at fetch time. Mitigation would require resolving via
   *   `dns.lookup` and passing the IP via the `lookup` option. Not
   *   implemented here because the attack surface is narrow (LAN-only
   *   hub, user-provided feed URLs) but worth revisiting if the hub is
   *   ever exposed beyond the LAN.
   */
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
}

module.exports = RssService;
