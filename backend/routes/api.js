const express = require('express');
const router = express.Router();
const storeManager = require('../services/storeManager');
const aiService = require('../services/aiService');

router.use((req, res, next) => {
  const token = req.headers['x-api-key'] || req.query.key;
  if (token !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await storeManager.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stores', async (req, res) => {
  try {
    res.json(await storeManager.getAllStores());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stores', async (req, res) => {
  const { name, shopifyDomain, shopifyToken, thresholdEuros } = req.body;
  if (!name || !shopifyDomain || !shopifyToken) {
    return res.status(400).json({ error: 'name, shopifyDomain, shopifyToken required' });
  }
  try {
    const store = await storeManager.addStore({ name, shopifyDomain, shopifyToken, thresholdEuros });
    res.status(201).json(store);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/stores/:id/threshold', async (req, res) => {
  const { threshold } = req.body;
  if (!threshold || isNaN(threshold)) return res.status(400).json({ error: 'Invalid threshold' });
  try {
    res.json(await storeManager.updateStoreThreshold(parseInt(req.params.id), parseFloat(threshold)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stores/:id/reset', async (req, res) => {
  try {
    res.json(await storeManager.resetStoreRevenue(parseInt(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/stores/:id/toggle', async (req, res) => {
  const { enabled } = req.body;
  try {
    res.json(await storeManager.toggleStore(parseInt(req.params.id), enabled));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stores/:id/activate', async (req, res) => {
  try {
    await storeManager.activateStore(parseInt(req.params.id));
    res.json(await storeManager.getStoreById(parseInt(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rotate', async (req, res) => {
  try {
    const active = await storeManager.getActiveStore();
    if (!active) return res.status(400).json({ error: 'No active store found' });
    const next = await storeManager.rotateToNextStore(active.id, 'manual');
    res.json({ previous: active, next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/redirect', async (req, res) => {
  try {
    const active = await storeManager.getActiveStore();
    if (!active) return res.status(503).json({ error: 'No active store available' });
    const protocol = process.env.SHOPIFY_PROTOCOL || 'https';
    res.json({
      store: active.name,
      url: `${protocol}://${active.shopify_domain}`,
      domain: active.shopify_domain,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ai/insights', async (req, res) => {
  try {
    const insights = await aiService.getLatestInsights(10);
    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/generate', async (req, res) => {
  const { type = 'daily_summary' } = req.body;
  try {
    const insight = await aiService.generateInsight(type);
    res.json({ insight });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
