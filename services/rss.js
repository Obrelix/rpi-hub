'use strict';

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
    // Stub — filled in Task 6
    throw new Error('Not an RSS or Atom feed');
  }

  _textOf(node) {
    if (node == null) return null;
    if (typeof node === 'string') return node;
    if (typeof node === 'object' && node['#text']) return String(node['#text']);
    return null;
  }
}

module.exports = RssService;
