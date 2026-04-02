const Stats = require('../../services/stats');

let stats;

beforeEach(() => {
  jest.clearAllMocks();
  stats = new Stats();
});

test('parseMeminfo extracts total, used, available', () => {
  const meminfo = [
    'MemTotal:        3884564 kB',
    'MemFree:          512000 kB',
    'MemAvailable:    2000000 kB',
    'Buffers:          100000 kB',
    'Cached:           800000 kB'
  ].join('\n');

  const result = stats.parseMeminfo(meminfo);
  expect(result.totalMb).toBeCloseTo(3793.5, 0);
  expect(result.availableMb).toBeCloseTo(1953.1, 0);
  expect(result.usedPercent).toBeGreaterThan(0);
  expect(result.usedPercent).toBeLessThan(100);
});

test('parseTemperature converts millidegrees to celsius', () => {
  expect(stats.parseTemperature('48250')).toBe(48.3);
  expect(stats.parseTemperature('55000')).toBe(55.0);
});

test('parseTemperature returns null for invalid input', () => {
  expect(stats.parseTemperature('')).toBeNull();
  expect(stats.parseTemperature('abc')).toBeNull();
});

test('parseDf extracts disk usage', () => {
  const dfOutput = [
    'Filesystem      Size  Used Avail Use% Mounted on',
    '/dev/mmcblk0p2   29G   12G   16G  43% /'
  ].join('\n');

  const result = stats.parseDf(dfOutput);
  expect(result.length).toBe(1);
  expect(result[0].mount).toBe('/');
  expect(result[0].usedPercent).toBe(43);
  expect(result[0].size).toBe('29G');
  expect(result[0].used).toBe('12G');
  expect(result[0].available).toBe('16G');
});

test('parseCpuPercent computes CPU percentage from two snapshots', () => {
  const snap1 = 'cpu  10000 200 3000 80000 500 0 100 0 0 0';
  const snap2 = 'cpu  10100 200 3050 80500 500 0 110 0 0 0';

  const percent = stats.parseCpuPercent(snap1, snap2);
  expect(percent).toBeCloseTo(24.2, 0);
});
