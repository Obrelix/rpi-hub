'use strict';

const { execFile } = require('child_process');
const HOTSPOT_CON = 'RPi-Hub';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_SSID_LEN = 32;
const MIN_PASS_LEN = 8;

class WifiService {
  /**
   * Run nmcli with the given arguments.
   * Returns stdout on success, throws on failure.
   */
  _run(args, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      execFile('nmcli', args, { timeout: timeoutMs }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr ? stderr.trim() : err.message;
          return reject(new Error(msg));
        }
        resolve(stdout);
      });
    });
  }

  /**
   * List saved WiFi connections.
   * Returns [{name, uuid}].
   */
  async getNetworks() {
    const out = await this._run(['-t', '-f', 'NAME,UUID,TYPE', 'connection', 'show']);
    const networks = [];
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      // nmcli -t uses ':' as separator; colons in values are escaped as \:
      const parts = line.split(/(?<!\\):/);
      if (parts.length < 3) continue;
      const type = parts[parts.length - 1].trim();
      if (type !== '802-11-wireless') continue;
      const uuid = parts[parts.length - 2].trim();
      // name may contain colons, so rejoin everything before uuid
      const name = parts.slice(0, parts.length - 2).join(':').replace(/\\:/g, ':').trim();
      if (name === HOTSPOT_CON) continue;
      networks.push({ name, uuid });
    }
    return networks;
  }

  /**
   * Get the active WiFi connection on wlan0.
   * Returns {name, uuid} or null.
   */
  async getActiveNetwork() {
    const out = await this._run(['-t', '-f', 'NAME,UUID,TYPE,DEVICE', 'connection', 'show', '--active']);
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split(/(?<!\\):/);
      if (parts.length < 4) continue;
      const device = parts[parts.length - 1].trim();
      const type = parts[parts.length - 2].trim();
      if (type !== '802-11-wireless' || device !== 'wlan0') continue;
      const uuid = parts[parts.length - 3].trim();
      const name = parts.slice(0, parts.length - 3).join(':').replace(/\\:/g, ':').trim();
      return { name, uuid };
    }
    return null;
  }

  /**
   * Scan for available WiFi networks.
   * Returns [{ssid, signal, security}].
   */
  async scan() {
    const out = await this._run(
      ['-t', '-f', 'SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes'],
      20000
    );
    const seen = new Set();
    const networks = [];
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split(/(?<!\\):/);
      if (parts.length < 3) continue;
      const security = parts[parts.length - 1].replace(/\\:/g, ':').trim();
      const signal = parseInt(parts[parts.length - 2].trim(), 10);
      const ssid = parts.slice(0, parts.length - 2).join(':').replace(/\\:/g, ':').trim();
      if (!ssid || seen.has(ssid)) continue;
      seen.add(ssid);
      networks.push({ ssid, signal: isNaN(signal) ? 0 : signal, security });
    }
    networks.sort((a, b) => b.signal - a.signal);
    return networks;
  }

  /**
   * Add a new WiFi network (WPA-PSK).
   */
  async addNetwork(ssid, password) {
    if (!ssid || typeof ssid !== 'string' || ssid.length > MAX_SSID_LEN) {
      throw new Error('SSID must be a non-empty string of at most 32 characters');
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASS_LEN) {
      throw new Error('Password must be at least 8 characters');
    }
    await this._run([
      'connection', 'add',
      'type', 'wifi',
      'con-name', ssid,
      'ssid', ssid,
      'wifi-sec.key-mgmt', 'wpa-psk',
      'wifi-sec.psk', password
    ]);
  }

  /**
   * Remove a saved WiFi connection by UUID.
   */
  async removeNetwork(uuid) {
    if (!uuid || !UUID_RE.test(uuid)) {
      throw new Error('Invalid connection UUID');
    }
    await this._run(['connection', 'delete', 'uuid', uuid]);
  }

  /**
   * Activate a saved WiFi connection by UUID.
   */
  async connect(uuid) {
    if (!uuid || !UUID_RE.test(uuid)) {
      throw new Error('Invalid connection UUID');
    }
    await this._run(['connection', 'up', 'uuid', uuid], 30000);
  }
  /**
   * Get the hotspot monitor service status.
   * Returns {enabled, active}.
   */
  async getHotspotStatus() {
    const run = (cmd, args) => new Promise((resolve) => {
      execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
        resolve(err ? '' : stdout.trim());
      });
    });
    const [enabled, active] = await Promise.all([
      run('systemctl', ['is-enabled', 'wifi-hotspot']),
      run('systemctl', ['is-active', 'wifi-hotspot'])
    ]);
    return { enabled: enabled === 'enabled', active: active === 'active' };
  }

  /**
   * Enable and start the hotspot monitor service.
   */
  async enableHotspot() {
    await this._runSystemctl(['enable', '--now', 'wifi-hotspot']);
  }

  /**
   * Disable and stop the hotspot monitor service.
   */
  async disableHotspot() {
    await this._runSystemctl(['disable', '--now', 'wifi-hotspot']);
  }

  _runSystemctl(args) {
    return new Promise((resolve, reject) => {
      execFile('systemctl', args, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr ? stderr.trim() : err.message));
        resolve(stdout);
      });
    });
  }
}

module.exports = WifiService;
