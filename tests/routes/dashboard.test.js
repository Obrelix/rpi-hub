const { createApp } = require('../../app');
const http = require('http');

// Mock systemctl — must match the import path used in app.js
jest.mock('../../services/systemctl', () => {
  return jest.fn().mockImplementation(() => ({
    getStatus: jest.fn().mockResolvedValue({ active: 'inactive', sub: 'dead', pid: '', since: '' }),
    getAllStatuses: jest.fn().mockResolvedValue({
      'maze-battlegrounds.service': { active: 'active', sub: 'running', pid: '1234', since: '2025-01-01' },
      'voidex.service': { active: 'inactive', sub: 'dead', pid: '', since: '' }
    }),
    start: jest.fn().mockResolvedValue(''),
    stop: jest.fn().mockResolvedValue(''),
    restart: jest.fn().mockResolvedValue(''),
    waitForState: jest.fn().mockResolvedValue(undefined),
    getRecentLogs: jest.fn().mockResolvedValue('')
  }));
});

// Mock stats — must match the import path used in app.js
jest.mock('../../services/stats', () => {
  return jest.fn().mockImplementation(() => ({
    getAll: jest.fn().mockResolvedValue({
      cpu: 25, temperature: 45,
      memory: { totalMb: 4000, availableMb: 2000, usedMb: 2000, usedPercent: 50 },
      disk: [{ mount: '/', size: '29G', used: '12G', available: '16G', usedPercent: 43 }]
    }),
    getMemory: jest.fn().mockResolvedValue({ totalMb: 4000, availableMb: 2000, usedMb: 2000, usedPercent: 50 }),
    getTemperature: jest.fn().mockResolvedValue(45),
    getDisk: jest.fn().mockResolvedValue([{ mount: '/', size: '29G', used: '12G', available: '16G', usedPercent: 43 }]),
    getCpuPercent: jest.fn().mockResolvedValue(25)
  }));
});

// Mock deploy service — instantiated at module load in routes/deploy.js
jest.mock('../../services/deploy', () => {
  return jest.fn().mockImplementation(() => ({
    gitPull: jest.fn().mockResolvedValue(''),
    extractUpload: jest.fn().mockResolvedValue(undefined),
    getTmpDir: jest.fn().mockReturnValue('/tmp'),
    cleanup: jest.fn()
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

function get(path) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    http.get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('GET /health returns ok', async () => {
  const res = await get('/health');
  expect(res.status).toBe(200);
  const data = JSON.parse(res.body);
  expect(data.status).toBe('ok');
});

test('GET / returns dashboard with service names', async () => {
  const res = await get('/');
  expect(res.status).toBe(200);
  expect(res.body).toContain('RPi Hub');
  expect(res.body).toContain('Maze Battlegrounds');
  expect(res.body).toContain('Voidex');
});

test('GET / renders signboard widget and includes signboard service', async () => {
  const res = await get('/');
  expect(res.status).toBe(200);
  expect(res.body).toContain('signboard-widget');
  expect(res.body).toContain('signboard-widget.js');
  expect(res.body).toContain('RPi Signboard');
});

test('GET /logs returns logs page', async () => {
  const res = await get('/logs');
  expect(res.status).toBe(200);
  expect(res.body).toContain('Log Viewer');
});

test('GET /system returns system info page', async () => {
  const res = await get('/system');
  expect(res.status).toBe(200);
  expect(res.body).toContain('System Info');
});

test('GET /deploy returns deploy page', async () => {
  const res = await get('/deploy');
  expect(res.status).toBe(200);
  expect(res.body).toContain('Deploy');
});

test('GET /settings returns settings page', async () => {
  const res = await get('/settings');
  expect(res.status).toBe(200);
  expect(res.body).toContain('Settings');
});
