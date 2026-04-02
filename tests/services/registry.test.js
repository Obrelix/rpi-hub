const path = require('path');
const fs = require('fs');
const os = require('os');

let Registry;
let tmpFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `services-test-${Date.now()}.json`);
  const data = {
    "svc-a": {
      name: "Service A", unit: "svc-a.service", deployPath: "/opt/svc-a",
      repo: "https://github.com/test/svc-a.git", configFile: null,
      group: "led-panel", description: "Test service A"
    },
    "svc-b": {
      name: "Service B", unit: "svc-b.service", deployPath: "/opt/svc-b",
      repo: null, configFile: "/opt/svc-b/config.yaml",
      group: "led-panel", description: "Test service B"
    },
    "svc-c": {
      name: "Service C", unit: "svc-c.service", deployPath: "/opt/svc-c",
      repo: null, configFile: null, group: null, description: "Independent service"
    }
  };
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  Registry = require('../../services/registry');
});

afterEach(() => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  delete require.cache[require.resolve('../../services/registry')];
});

test('getAll returns all services', () => {
  const registry = new Registry(tmpFile);
  const all = registry.getAll();
  expect(Object.keys(all)).toEqual(['svc-a', 'svc-b', 'svc-c']);
});

test('get returns a single service by id', () => {
  const registry = new Registry(tmpFile);
  const svc = registry.get('svc-a');
  expect(svc.name).toBe('Service A');
  expect(svc.unit).toBe('svc-a.service');
});

test('get returns null for unknown id', () => {
  const registry = new Registry(tmpFile);
  expect(registry.get('nonexistent')).toBeNull();
});

test('getGroupMembers returns services in the same group', () => {
  const registry = new Registry(tmpFile);
  const members = registry.getGroupMembers('led-panel');
  const ids = members.map(m => m.id);
  expect(ids).toContain('svc-a');
  expect(ids).toContain('svc-b');
  expect(ids).not.toContain('svc-c');
});

test('getGroupMembers returns empty array for null group', () => {
  const registry = new Registry(tmpFile);
  expect(registry.getGroupMembers(null)).toEqual([]);
});

test('getConflicting returns other group members excluding the given id', () => {
  const registry = new Registry(tmpFile);
  const conflicts = registry.getConflicting('svc-a');
  expect(conflicts.length).toBe(1);
  expect(conflicts[0].id).toBe('svc-b');
});

test('getConflicting returns empty for ungrouped service', () => {
  const registry = new Registry(tmpFile);
  expect(registry.getConflicting('svc-c')).toEqual([]);
});

test('add persists a new service to the file', () => {
  const registry = new Registry(tmpFile);
  registry.add('svc-d', {
    name: "Service D", unit: "svc-d.service", deployPath: "/opt/svc-d",
    repo: null, configFile: null, group: null, description: "New service"
  });
  const raw = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
  expect(raw['svc-d']).toBeDefined();
  expect(raw['svc-d'].name).toBe('Service D');
});

test('remove deletes a service and persists', () => {
  const registry = new Registry(tmpFile);
  registry.remove('svc-a');
  const raw = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
  expect(raw['svc-a']).toBeUndefined();
  expect(Object.keys(raw).length).toBe(2);
});

test('update modifies a service and persists', () => {
  const registry = new Registry(tmpFile);
  registry.update('svc-a', { description: 'Updated description' });
  const raw = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
  expect(raw['svc-a'].description).toBe('Updated description');
  expect(raw['svc-a'].name).toBe('Service A');
});
