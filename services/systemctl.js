const { exec } = require('child_process');

class Systemctl {
  _validateUnit(unit) {
    if (!/^[a-zA-Z0-9._@:-]+$/.test(unit)) {
      throw new Error(`Invalid unit name: ${unit}`);
    }
  }

  _exec(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) return reject(error);
        resolve(stdout);
      });
    });
  }

  async getStatus(unit) {
    this._validateUnit(unit);
    const cmd = `systemctl show ${unit} --property=ActiveState,SubState,MainPID,ActiveEnterTimestamp`;
    const stdout = await this._exec(cmd);

    // Parse key=value pairs (order is not guaranteed with --value)
    const props = {};
    for (const line of stdout.trim().split('\n')) {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        props[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }

    return {
      active: props.ActiveState || 'unknown',
      sub: props.SubState || 'unknown',
      pid: props.MainPID || '',
      since: props.ActiveEnterTimestamp || ''
    };
  }

  async getAllStatuses(units) {
    const results = {};
    await Promise.all(
      units.map(async (unit) => {
        try {
          results[unit] = await this.getStatus(unit);
        } catch {
          results[unit] = { active: 'unknown', sub: 'unknown', pid: '', since: '' };
        }
      })
    );
    return results;
  }

  async start(unit) {
    this._validateUnit(unit);
    return this._exec(`systemctl start ${unit}`);
  }

  async stop(unit) {
    this._validateUnit(unit);
    return this._exec(`systemctl stop ${unit}`);
  }

  async restart(unit) {
    this._validateUnit(unit);
    return this._exec(`systemctl restart ${unit}`);
  }

  async getRecentLogs(unit, lines = 20) {
    this._validateUnit(unit);
    return this._exec(`journalctl -u ${unit} -n ${lines} --no-pager`);
  }

  async waitForState(unit, targetState, timeoutMs = 10000) {
    this._validateUnit(unit);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.getStatus(unit);
      if (status.active === targetState) return status;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Timeout: ${unit} did not reach state "${targetState}" within ${timeoutMs}ms`);
  }
}

module.exports = Systemctl;
