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
