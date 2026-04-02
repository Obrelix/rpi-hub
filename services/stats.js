const fs = require('fs');
const { exec } = require('child_process');

class Stats {
  constructor() {
    this._lastCpuSnap = null;
  }

  _exec(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout.trim());
      });
    });
  }

  parseMeminfo(raw) {
    const lines = raw.split('\n');
    const getValue = (key) => {
      const line = lines.find(l => l.startsWith(key + ':'));
      if (!line) return 0;
      return parseInt(line.split(/\s+/)[1], 10);
    };
    const totalKb = getValue('MemTotal');
    const availableKb = getValue('MemAvailable');
    const totalMb = totalKb / 1024;
    const availableMb = availableKb / 1024;
    const usedMb = totalMb - availableMb;
    const usedPercent = totalMb > 0 ? Math.round((usedMb / totalMb) * 1000) / 10 : 0;
    return { totalMb, availableMb, usedMb, usedPercent };
  }

  parseTemperature(raw) {
    const val = parseInt(raw.trim(), 10);
    if (isNaN(val)) return null;
    return Math.round(val / 100) / 10;
  }

  parseDf(raw) {
    const lines = raw.trim().split('\n').slice(1);
    return lines.map(line => {
      const parts = line.split(/\s+/);
      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usedPercent: parseInt(parts[4], 10),
        mount: parts[5]
      };
    });
  }

  parseCpuPercent(snapOld, snapNew) {
    const parse = (line) => {
      const parts = line.trim().split(/\s+/).slice(1).map(Number);
      const idle = parts[3];
      const total = parts.reduce((a, b) => a + b, 0);
      return { idle, total };
    };
    const old = parse(snapOld);
    const cur = parse(snapNew);
    const totalDiff = cur.total - old.total;
    const idleDiff = cur.idle - old.idle;
    if (totalDiff === 0) return 0;
    return Math.round(((totalDiff - idleDiff) / totalDiff) * 1000) / 10;
  }

  async getMemory() {
    const raw = fs.readFileSync('/proc/meminfo', 'utf-8');
    return this.parseMeminfo(raw);
  }

  async getTemperature() {
    try {
      const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
      return this.parseTemperature(raw);
    } catch {
      return null;
    }
  }

  async getDisk() {
    const raw = await this._exec('df -h /');
    return this.parseDf(raw);
  }

  async getCpuPercent() {
    const raw = fs.readFileSync('/proc/stat', 'utf-8');
    const cpuLine = raw.split('\n')[0];
    if (!this._lastCpuSnap) {
      this._lastCpuSnap = cpuLine;
      return 0;
    }
    const percent = this.parseCpuPercent(this._lastCpuSnap, cpuLine);
    this._lastCpuSnap = cpuLine;
    return percent;
  }

  async getAll() {
    const [cpu, temperature, memory, disk] = await Promise.all([
      this.getCpuPercent(),
      this.getTemperature(),
      this.getMemory(),
      this.getDisk()
    ]);
    return { cpu, temperature, memory, disk };
  }
}

module.exports = Stats;
