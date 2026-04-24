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
