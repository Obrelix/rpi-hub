const { exec } = require('child_process');

class Systemctl {
  _exec(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) return reject(error);
        resolve(stdout);
      });
    });
  }

  async getStatus(unit) {
    const cmd = `systemctl show ${unit} --property=ActiveState,SubState,MainPID,ActiveEnterTimestamp --value`;
    const stdout = await this._exec(cmd);
    const lines = stdout.trim().split('\n');
    return {
      active: lines[0] || 'unknown',
      sub: lines[1] || 'unknown',
      pid: lines[2] || '',
      since: lines[3] || ''
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
    return this._exec(`systemctl start ${unit}`);
  }

  async stop(unit) {
    return this._exec(`systemctl stop ${unit}`);
  }

  async restart(unit) {
    return this._exec(`systemctl restart ${unit}`);
  }

  async getRecentLogs(unit, lines = 20) {
    return this._exec(`journalctl -u ${unit} -n ${lines} --no-pager`);
  }

  async waitForState(unit, targetState, timeoutMs = 10000) {
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
