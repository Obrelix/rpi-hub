const express = require('express');
const router = express.Router();

router.get('/logs', (req, res) => {
  const registry = req.app.get('registry');
  const services = registry.getAll();
  const serviceList = Object.entries(services).map(([id, svc]) => ({ id, name: svc.name }));

  res.render('logs', {
    activePage: 'logs',
    pageTitle: 'Logs',
    pageScript: '/js/logs.js',
    services: serviceList
  });
});

module.exports = router;
