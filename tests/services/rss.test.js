const RssService = require('../../services/rss');
const fs = require('fs');
const path = require('path');
function fixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'rss', name), 'utf-8');
}

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
