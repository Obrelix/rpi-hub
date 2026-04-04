const express  = require('express');
const path     = require('path');
const Registry = require('./services/registry');
const Systemctl = require('./services/systemctl');
const Stats    = require('./services/stats');

const dashboardRouter = require('./routes/dashboard');
const logsRouter      = require('./routes/logs');
const systemRouter    = require('./routes/system');
const deployRouter    = require('./routes/deploy');
const settingsRouter  = require('./routes/settings');
const stationsRouter  = require('./routes/stations');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // --- Instantiate services ----------------------------------------
  const registry  = new Registry(path.join(__dirname, 'services.json'));
  const systemctl = new Systemctl();
  const stats     = new Stats();

  app.set('registry',  registry);
  app.set('systemctl', systemctl);
  app.set('stats',     stats);

  // --- Health check ------------------------------------------------
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // --- Routes ------------------------------------------------------
  app.use('/', dashboardRouter);
  app.use('/', logsRouter);
  app.use('/', systemRouter);
  app.use('/', deployRouter);
  app.use('/', stationsRouter);
  app.use('/', settingsRouter);

  // --- 404 handler -------------------------------------------------
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // --- Error handler -----------------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
