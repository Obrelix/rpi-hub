const express = require('express');
const router = express.Router();

router.get('/stations', (req, res) => {
  res.render('stations', {
    pageTitle: 'Stations',
    activePage: 'stations',
    pageScript: '/js/stations.js',
  });
});

module.exports = router;
