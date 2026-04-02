const express = require('express');
const os      = require('os');
const { exec } = require('child_process');
const router  = express.Router();

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

/* ------------------------------------------------------------------ */
/*  GET /system                                                         */
/* ------------------------------------------------------------------ */
router.get('/system', async (req, res) => {
  const stats = req.app.get('stats');

  try {
    // Shell commands — fall back to empty string on error (Windows dev)
    const [
      hostname,
      kernel,
      osRelease,
      nodeVersion,
      pythonVersion,
      uptimeStr
    ] = await Promise.all([
      run('hostname'),
      run('uname -r'),
      run("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'"),
      run('node --version'),
      run('python3 --version'),
      run('uptime -p')
    ]);

    const [memory, disk, temperature] = await Promise.all([
      stats.getMemory().catch(() => ({ totalMb: 0, usedMb: 0, availableMb: 0, usedPercent: 0 })),
      stats.getDisk().catch(() => []),
      stats.getTemperature().catch(() => null)
    ]);

    // CPU info from os module
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
    const cpuCores = cpus.length;

    // Network interfaces — external only
    const rawInterfaces = os.networkInterfaces();
    const networkInterfaces = [];
    for (const [name, addrs] of Object.entries(rawInterfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (!addr.internal) {
          networkInterfaces.push({ name, address: addr.address, family: addr.family });
        }
      }
    }

    res.render('system', {
      pageTitle:  'System Info',
      activePage: 'system',
      pageScript: null,
      hostname:   hostname || os.hostname(),
      os:         osRelease || process.platform,
      kernel:     kernel || 'n/a',
      uptime:     uptimeStr || `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      nodeVersion: nodeVersion || process.version,
      pythonVersion: pythonVersion || 'n/a',
      cpuModel,
      cpuCores,
      temperature,
      memory,
      disk,
      networkInterfaces
    });
  } catch (err) {
    console.error('[system] GET /system error:', err);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
