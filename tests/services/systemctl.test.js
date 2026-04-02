const Systemctl = require('../../services/systemctl');

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn()
}));

const { exec } = require('child_process');

let systemctl;

beforeEach(() => {
  jest.clearAllMocks();
  systemctl = new Systemctl();
});

test('getStatus parses active service correctly', async () => {
  exec.mockImplementation((cmd, cb) => {
    cb(null, 'active\nrunning\n1234\n2025-01-01 10:00:00 UTC', '');
  });
  const status = await systemctl.getStatus('test.service');
  expect(status.active).toBe('active');
  expect(status.sub).toBe('running');
  expect(status.pid).toBe('1234');
  expect(status.since).toBe('2025-01-01 10:00:00 UTC');
  expect(exec).toHaveBeenCalledWith(
    expect.stringContaining('systemctl show test.service'),
    expect.any(Function)
  );
});

test('getStatus handles inactive service', async () => {
  exec.mockImplementation((cmd, cb) => {
    cb(null, 'inactive\ndead\n\n', '');
  });
  const status = await systemctl.getStatus('test.service');
  expect(status.active).toBe('inactive');
  expect(status.sub).toBe('dead');
  expect(status.pid).toBe('');
});

test('start calls systemctl start', async () => {
  exec.mockImplementation((cmd, cb) => cb(null, '', ''));
  await systemctl.start('test.service');
  expect(exec).toHaveBeenCalledWith('systemctl start test.service', expect.any(Function));
});

test('stop calls systemctl stop', async () => {
  exec.mockImplementation((cmd, cb) => cb(null, '', ''));
  await systemctl.stop('test.service');
  expect(exec).toHaveBeenCalledWith('systemctl stop test.service', expect.any(Function));
});

test('restart calls systemctl restart', async () => {
  exec.mockImplementation((cmd, cb) => cb(null, '', ''));
  await systemctl.restart('test.service');
  expect(exec).toHaveBeenCalledWith('systemctl restart test.service', expect.any(Function));
});

test('start rejects on exec error', async () => {
  exec.mockImplementation((cmd, cb) => cb(new Error('Failed to start'), '', 'error'));
  await expect(systemctl.start('test.service')).rejects.toThrow('Failed to start');
});

test('getRecentLogs returns last N lines from journalctl', async () => {
  exec.mockImplementation((cmd, cb) => {
    cb(null, 'line1\nline2\nline3', '');
  });
  const logs = await systemctl.getRecentLogs('test.service', 20);
  expect(logs).toBe('line1\nline2\nline3');
  expect(exec).toHaveBeenCalledWith(
    'journalctl -u test.service -n 20 --no-pager',
    expect.any(Function)
  );
});

test('getAllStatuses returns status for multiple units', async () => {
  let callCount = 0;
  exec.mockImplementation((cmd, cb) => {
    callCount++;
    if (callCount === 1) {
      cb(null, 'active\nrunning\n1000\n2025-01-01 10:00:00 UTC', '');
    } else {
      cb(null, 'inactive\ndead\n\n', '');
    }
  });
  const statuses = await systemctl.getAllStatuses(['a.service', 'b.service']);
  expect(statuses['a.service'].active).toBe('active');
  expect(statuses['b.service'].active).toBe('inactive');
});
