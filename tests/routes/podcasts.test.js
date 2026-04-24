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
