const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { exec } = require('child_process');
const router   = express.Router();

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function isAllowedPath(filePath) {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  return resolved.startsWith('/home/obrelix/');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

/* ------------------------------------------------------------------ */
/*  GET /settings                                                       */
/* ------------------------------------------------------------------ */
router.get('/settings', (req, res) => {
  const registry = req.app.get('registry');
  const config   = loadConfig();

  const all = registry.getAll();
  const services = Object.entries(all).map(([id, svc]) => {
    let configContent = null;
    if (svc.configFile && isAllowedPath(svc.configFile)) {
      try {
        configContent = fs.readFileSync(svc.configFile, 'utf-8');
      } catch {
        configContent = null;
      }
    }
    return { id, ...svc, configContent };
  });

  const success = req.query.success || null;
  const error   = req.query.error   || null;

  res.render('settings', {
    pageTitle:  'Settings',
    activePage: 'settings',
    pageScript: '/js/settings.js',
    config,
    services,
    success,
    error
  });
});

/* ------------------------------------------------------------------ */
/*  POST /settings/hub — save hub configuration                        */
/* ------------------------------------------------------------------ */
router.post('/settings/hub', (req, res) => {
  try {
    const current = loadConfig();
    const port            = parseInt(req.body.port,            10);
    const statsIntervalMs = parseInt(req.body.statsIntervalMs, 10);
    const maxUploadSizeMb = parseInt(req.body.maxUploadSizeMb, 10);

    if (isNaN(port) || port < 1 || port > 65535)
      return res.redirect('/settings?error=' + encodeURIComponent('Invalid port number'));
    if (isNaN(statsIntervalMs) || statsIntervalMs < 100)
      return res.redirect('/settings?error=' + encodeURIComponent('Stats interval must be at least 100ms'));
    if (isNaN(maxUploadSizeMb) || maxUploadSizeMb < 1)
      return res.redirect('/settings?error=' + encodeURIComponent('Max upload size must be at least 1 MB'));

    saveConfig({ ...current, port, statsIntervalMs, maxUploadSizeMb });
    res.redirect('/settings?success=' + encodeURIComponent('Hub configuration saved'));
  } catch (err) {
    console.error('[settings] POST /settings/hub:', err);
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

/* ------------------------------------------------------------------ */
/*  POST /settings/config/:id — save service config file               */
/* ------------------------------------------------------------------ */
router.post('/settings/config/:id', (req, res) => {
  const { id }   = req.params;
  const registry = req.app.get('registry');

  const svc = registry.get(id);
  if (!svc) return res.redirect('/settings?error=' + encodeURIComponent('Service not found: ' + id));
  if (!svc.configFile) return res.redirect('/settings?error=' + encodeURIComponent('No config file configured for ' + id));
  if (!isAllowedPath(svc.configFile)) return res.redirect('/settings?error=' + encodeURIComponent('Config file path is not in an allowed location'));

  try {
    fs.writeFileSync(svc.configFile, req.body.content || '');
    res.redirect('/settings?success=' + encodeURIComponent(`Config file saved for ${svc.name}`));
  } catch (err) {
    console.error(`[settings] POST /settings/config/${id}:`, err);
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

/* ------------------------------------------------------------------ */
/*  POST /settings/services/add                                         */
/* ------------------------------------------------------------------ */
router.post('/settings/services/add', (req, res) => {
  const registry = req.app.get('registry');
  const { id, name, unit, deployPath, repo, configFile, group, description } = req.body;

  if (!id || !name || !unit)
    return res.redirect('/settings?error=' + encodeURIComponent('id, name, and unit are required'));

  if (registry.get(id))
    return res.redirect('/settings?error=' + encodeURIComponent(`Service id "${id}" already exists`));

  const trimmedConfigFile = configFile ? configFile.trim() : null;
  if (trimmedConfigFile && !isAllowedPath(trimmedConfigFile))
    return res.redirect('/settings?error=' + encodeURIComponent('Config file path is not in an allowed location'));

  try {
    registry.add(id.trim(), {
      name: name.trim(),
      unit: unit.trim(),
      deployPath:  deployPath  ? deployPath.trim()  : null,
      repo:        repo        ? repo.trim()        : null,
      configFile:  trimmedConfigFile,
      group:       group       ? group.trim()       : null,
      description: description ? description.trim() : null
    });
    res.redirect('/settings?success=' + encodeURIComponent(`Service "${name}" added`));
  } catch (err) {
    console.error('[settings] add service:', err);
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

/* ------------------------------------------------------------------ */
/*  POST /settings/services/remove/:id                                  */
/* ------------------------------------------------------------------ */
router.post('/settings/services/remove/:id', (req, res) => {
  const { id }   = req.params;
  const registry = req.app.get('registry');

  const svc = registry.get(id);
  if (!svc) return res.redirect('/settings?error=' + encodeURIComponent('Service not found: ' + id));

  try {
    registry.remove(id);
    res.redirect('/settings?success=' + encodeURIComponent(`Service "${svc.name}" removed`));
  } catch (err) {
    console.error(`[settings] remove ${id}:`, err);
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

/* ------------------------------------------------------------------ */
/*  POST /settings/services/update/:id                                  */
/* ------------------------------------------------------------------ */
router.post('/settings/services/update/:id', (req, res) => {
  const { id }   = req.params;
  const registry = req.app.get('registry');

  const svc = registry.get(id);
  if (!svc) return res.redirect('/settings?error=' + encodeURIComponent('Service not found: ' + id));

  const { name, unit, deployPath, repo, configFile, group, description } = req.body;

  if (!name || !unit)
    return res.redirect('/settings?error=' + encodeURIComponent('name and unit are required'));

  const trimmedConfigFileUpdate = configFile ? configFile.trim() : null;
  if (trimmedConfigFileUpdate && !isAllowedPath(trimmedConfigFileUpdate))
    return res.redirect('/settings?error=' + encodeURIComponent('Config file path is not in an allowed location'));

  try {
    registry.update(id, {
      name:        name.trim(),
      unit:        unit.trim(),
      deployPath:  deployPath  ? deployPath.trim()  : null,
      repo:        repo        ? repo.trim()        : null,
      configFile:  trimmedConfigFileUpdate,
      group:       group       ? group.trim()       : null,
      description: description ? description.trim() : null
    });
    res.redirect('/settings?success=' + encodeURIComponent(`Service "${name}" updated`));
  } catch (err) {
    console.error(`[settings] update ${id}:`, err);
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

/* ------------------------------------------------------------------ */
/*  WiFi API endpoints                                                  */
/* ------------------------------------------------------------------ */

/** GET /settings/wifi — list saved networks + active connection */
router.get('/settings/wifi', async (req, res) => {
  const wifi = req.app.get('wifi');
  try {
    const [networks, active] = await Promise.all([
      wifi.getNetworks(),
      wifi.getActiveNetwork()
    ]);
    res.json({ networks, active });
  } catch (err) {
    console.error('[settings] GET /settings/wifi:', err.message);
    res.json({ networks: [], active: null, error: err.message });
  }
});

/** GET /settings/wifi/scan — scan for available WiFi networks */
router.get('/settings/wifi/scan', async (req, res) => {
  const wifi = req.app.get('wifi');
  try {
    const available = await wifi.scan();
    res.json({ available });
  } catch (err) {
    console.error('[settings] GET /settings/wifi/scan:', err.message);
    res.json({ available: [], error: err.message });
  }
});

/** POST /settings/wifi/add — add a new WiFi network */
router.post('/settings/wifi/add', async (req, res) => {
  const wifi = req.app.get('wifi');
  const { ssid, password } = req.body;
  try {
    await wifi.addNetwork(ssid, password);
    res.json({ ok: true });
  } catch (err) {
    console.error('[settings] POST /settings/wifi/add:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/** POST /settings/wifi/remove — remove a saved WiFi network */
router.post('/settings/wifi/remove', async (req, res) => {
  const wifi = req.app.get('wifi');
  const { uuid } = req.body;
  try {
    await wifi.removeNetwork(uuid);
    res.json({ ok: true });
  } catch (err) {
    console.error('[settings] POST /settings/wifi/remove:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/** POST /settings/wifi/connect — connect to a saved WiFi network */
router.post('/settings/wifi/connect', async (req, res) => {
  const wifi = req.app.get('wifi');
  const { uuid } = req.body;
  try {
    await wifi.connect(uuid);
    res.json({ ok: true });
  } catch (err) {
    console.error('[settings] POST /settings/wifi/connect:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/** GET /settings/wifi/hotspot — get hotspot monitor status */
router.get('/settings/wifi/hotspot', async (req, res) => {
  const wifi = req.app.get('wifi');
  try {
    const status = await wifi.getHotspotStatus();
    res.json(status);
  } catch (err) {
    console.error('[settings] GET /settings/wifi/hotspot:', err.message);
    res.json({ enabled: false, active: false, error: err.message });
  }
});

/** POST /settings/wifi/hotspot — enable or disable hotspot monitor */
router.post('/settings/wifi/hotspot', async (req, res) => {
  const wifi = req.app.get('wifi');
  const { enable } = req.body;
  try {
    if (enable) {
      await wifi.enableHotspot();
    } else {
      await wifi.disableHotspot();
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[settings] POST /settings/wifi/hotspot:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /settings/reboot — reboot the Raspberry Pi                    */
/* ------------------------------------------------------------------ */
router.post('/settings/reboot', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    exec('sudo reboot', (err) => {
      if (err) console.error('[settings] reboot failed:', err.message);
    });
  }, 1000);
});

/* ------------------------------------------------------------------ */
/*  POST /settings/shutdown — shut down the Raspberry Pi               */
/* ------------------------------------------------------------------ */
router.post('/settings/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    exec('sudo shutdown -h now', (err) => {
      if (err) console.error('[settings] shutdown failed:', err.message);
    });
  }, 1000);
});

module.exports = router;
