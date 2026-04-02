const fs = require('fs');

class Registry {
  constructor(filePath) {
    this.filePath = filePath;
    this._load();
  }

  _load() {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    this.data = JSON.parse(raw);
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  getAll() {
    return { ...this.data };
  }

  get(id) {
    return this.data[id] ? { ...this.data[id] } : null;
  }

  getGroupMembers(group) {
    if (!group) return [];
    return Object.entries(this.data)
      .filter(([, svc]) => svc.group === group)
      .map(([id, svc]) => ({ id, ...svc }));
  }

  getConflicting(id) {
    const svc = this.data[id];
    if (!svc || !svc.group) return [];
    return this.getGroupMembers(svc.group).filter(m => m.id !== id);
  }

  add(id, service) {
    this.data[id] = service;
    this._save();
  }

  update(id, fields) {
    if (!this.data[id]) return;
    Object.assign(this.data[id], fields);
    this._save();
  }

  remove(id) {
    delete this.data[id];
    this._save();
  }
}

module.exports = Registry;
