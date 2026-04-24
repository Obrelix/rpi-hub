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
}

module.exports = RssService;
