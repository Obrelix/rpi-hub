const express = require('express');
const router = express.Router();

router.get('/podcasts', (req, res) => {
  res.render('podcasts', {
    pageTitle: 'Podcasts',
    activePage: 'podcasts',
    pageScript: '/js/podcasts.js',
  });
});

router.post('/podcasts/rss-preview', async (req, res) => {
  const feedUrl = req.body && req.body.feedUrl;
  if (typeof feedUrl !== 'string' || !feedUrl.trim()) {
    return res.status(400).json({ error: 'feedUrl required' });
  }
  const rss = req.app.get('rss');
  try {
    const result = await rss.fetchAndParse(feedUrl);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
