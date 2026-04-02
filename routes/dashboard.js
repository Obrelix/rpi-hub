const express = require('express');
const router = express.Router();

/* ------------------------------------------------------------------ */
/*  GET /  — Dashboard page                                            */
/* ------------------------------------------------------------------ */
router.get('/', async (req, res) => {
  const registry  = req.app.get('registry');
  const systemctl = req.app.get('systemctl');

  try {
    const all      = registry.getAll();
    const units    = Object.values(all).map(s => s.unit);
    const statuses = await systemctl.getAllStatuses(units);

    // Merge registry data with live status
    const services = Object.entries(all).map(([id, svc]) => {
      const st = statuses[svc.unit] || { active: 'unknown', sub: 'unknown', pid: '', since: '' };
      return {
        id,
        ...svc,
        active: st.active,
        sub:    st.sub,
        pid:    st.pid,
        since:  st.since
      };
    });

    res.render('dashboard', {
      pageTitle:  'Dashboard',
      activePage: 'dashboard',
      pageScript: '/js/dashboard.js',
      services
    });
  } catch (err) {
    console.error('[dashboard] GET / error:', err);
    res.status(500).send('Internal server error');
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/services/:id/start                                       */
/* ------------------------------------------------------------------ */
router.post('/api/services/:id/start', async (req, res) => {
  const { id }    = req.params;
  const registry  = req.app.get('registry');
  const systemctl = req.app.get('systemctl');
  const io        = req.app.get('io');

  const svc = registry.get(id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  try {
    // Stop any conflicting services in the same group first
    const conflicts = registry.getConflicting(id);
    await Promise.all(
      conflicts.map(async (c) => {
        try {
          await systemctl.stop(c.unit);
          await systemctl.waitForState(c.unit, 'inactive', 10000);
          io.emit('service-status-changed', { id: c.id, unit: c.unit, active: 'inactive' });
        } catch (e) {
          console.warn(`[dashboard] Could not stop conflicting service ${c.unit}:`, e.message);
        }
      })
    );

    await systemctl.start(svc.unit);
    const status = await systemctl.getStatus(svc.unit);
    io.emit('service-status-changed', { id, unit: svc.unit, active: status.active });
    io.emit('toast', { message: `${svc.name} started`, type: 'success' });
    res.json({ ok: true, status });
  } catch (err) {
    console.error(`[dashboard] start ${id}:`, err);
    let logs = '';
    try { logs = await systemctl.getRecentLogs(svc.unit, 20); } catch {}
    res.status(500).json({ error: err.message, logs });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/services/:id/stop                                        */
/* ------------------------------------------------------------------ */
router.post('/api/services/:id/stop', async (req, res) => {
  const { id }    = req.params;
  const registry  = req.app.get('registry');
  const systemctl = req.app.get('systemctl');
  const io        = req.app.get('io');

  const svc = registry.get(id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  try {
    await systemctl.stop(svc.unit);
    const status = await systemctl.getStatus(svc.unit);
    io.emit('service-status-changed', { id, unit: svc.unit, active: status.active });
    io.emit('toast', { message: `${svc.name} stopped`, type: 'warning' });
    res.json({ ok: true, status });
  } catch (err) {
    console.error(`[dashboard] stop ${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/services/:id/restart                                     */
/* ------------------------------------------------------------------ */
router.post('/api/services/:id/restart', async (req, res) => {
  const { id }    = req.params;
  const registry  = req.app.get('registry');
  const systemctl = req.app.get('systemctl');
  const io        = req.app.get('io');

  const svc = registry.get(id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  try {
    await systemctl.restart(svc.unit);
    const status = await systemctl.getStatus(svc.unit);
    io.emit('service-status-changed', { id, unit: svc.unit, active: status.active });
    io.emit('toast', { message: `${svc.name} restarted`, type: 'info' });
    res.json({ ok: true, status });
  } catch (err) {
    console.error(`[dashboard] restart ${id}:`, err);
    let logs = '';
    try { logs = await systemctl.getRecentLogs(svc.unit, 20); } catch {}
    res.status(500).json({ error: err.message, logs });
  }
});

module.exports = router;
