const express  = require('express');
const path     = require('path');
const multer   = require('multer');
const router   = express.Router();
const DeployService = require('../services/deploy');

const deployService = new DeployService();

/* ------------------------------------------------------------------ */
/*  GET /deploy                                                         */
/* ------------------------------------------------------------------ */
router.get('/deploy', (req, res) => {
  const registry = req.app.get('registry');
  const all = registry.getAll();
  const services = Object.entries(all).map(([id, svc]) => ({
    id,
    name: svc.name,
    repo: svc.repo || null,
    deployPath: svc.deployPath || null
  }));

  res.render('deploy', {
    pageTitle:  'Deploy',
    activePage: 'deploy',
    pageScript: '/js/deploy.js',
    services
  });
});

/* ------------------------------------------------------------------ */
/*  POST /deploy/:id/pull                                               */
/* ------------------------------------------------------------------ */
router.post('/deploy/:id/pull', async (req, res) => {
  const { id }    = req.params;
  const registry  = req.app.get('registry');
  const systemctl = req.app.get('systemctl');
  const io        = req.app.get('io');

  const svc = registry.get(id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  if (!svc.repo) return res.status(400).json({ error: 'No repository configured for this service' });
  if (!svc.deployPath) return res.status(400).json({ error: 'No deploy path configured for this service' });

  try {
    const output = await deployService.gitPull(svc.deployPath, (text) => {
      if (io) io.emit('deploy-progress', { id, text });
    });

    try {
      await systemctl.restart(svc.unit);
      const status = await systemctl.getStatus(svc.unit);
      if (io) {
        io.emit('service-status-changed', { id, unit: svc.unit, active: status.active });
        io.emit('toast', { message: `${svc.name} deployed and restarted`, type: 'success' });
      }
    } catch (restartErr) {
      console.warn(`[deploy] restart ${id}:`, restartErr.message);
      if (io) io.emit('toast', { message: `${svc.name} pulled but restart failed`, type: 'warning' });
    }

    res.json({ ok: true, output });
  } catch (err) {
    console.error(`[deploy] pull ${id}:`, err);
    if (io) io.emit('deploy-progress', { id, text: `ERROR: ${err.message}\n` });
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /deploy/:id/upload                                             */
/* ------------------------------------------------------------------ */
const config = require('../config.json');
const maxBytes = (config.maxUploadSizeMb || 50) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, deployService.getTmpDir()),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `upload-${Date.now()}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: maxBytes } });

router.post('/deploy/:id/upload', upload.single('archive'), async (req, res) => {
  const { id }    = req.params;
  const registry  = req.app.get('registry');
  const systemctl = req.app.get('systemctl');
  const io        = req.app.get('io');

  const svc = registry.get(id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  if (!svc.deployPath) return res.status(400).json({ error: 'No deploy path configured' });

  const filePath = req.file ? req.file.path : null;
  if (!filePath) return res.status(400).json({ error: 'No file uploaded' });

  try {
    if (io) io.emit('deploy-progress', { id, text: `Extracting ${req.file.originalname}…\n` });
    await deployService.extractUpload(filePath, svc.deployPath, req.file.originalname);
    if (io) io.emit('deploy-progress', { id, text: 'Extraction complete. Restarting service…\n' });

    try {
      await systemctl.restart(svc.unit);
      const status = await systemctl.getStatus(svc.unit);
      if (io) {
        io.emit('service-status-changed', { id, unit: svc.unit, active: status.active });
        io.emit('toast', { message: `${svc.name} uploaded and restarted`, type: 'success' });
        io.emit('deploy-progress', { id, text: 'Done.\n' });
      }
    } catch (restartErr) {
      console.warn(`[deploy] restart after upload ${id}:`, restartErr.message);
      if (io) io.emit('toast', { message: `${svc.name} uploaded but restart failed`, type: 'warning' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(`[deploy] upload ${id}:`, err);
    if (io) io.emit('deploy-progress', { id, text: `ERROR: ${err.message}\n` });
    res.status(500).json({ error: err.message });
  } finally {
    deployService.cleanup(filePath);
  }
});

module.exports = router;
