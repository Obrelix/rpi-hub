const express  = require('express');
const path     = require('path');
const Registry = require('./services/registry');
const Systemctl = require('./services/systemctl');
const Stats    = require('./services/stats');

const dashboardRouter = require('./routes/dashboard');
const logsRouter = require('./routes/logs');

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

  return app;
}

module.exports = { createApp };
