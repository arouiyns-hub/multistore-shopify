const express = require('express');
const router = express.Router();
const storeManager = require('../services/storeManager');
const aiService = require('../services/aiService');

// --- Auth middleware simple ---
router.use((req, res, next) => {
  const token = req.headers['x-api-key'] || req.query.key;
  if (token !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// GET /api/stats - tableau de bord complet
router.get('/stats', (req, res) => {
  try {
    const stats = storeManager.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stores - liste des boutiques
router.get('/stores', (req, res) => {
  res.json(storeManager.getAllStores());
});

// POST /api/stores - ajouter une boutique
router.post('/stores', (req, res) => {
  const { name, shopifyDomain, shopifyToken, thresholdEuros } = req.body;
  if (!name || !shopifyDomain || !shopifyToken) {
    return res.status(400).json({ error: 'name, shopifyDomain, shopifyToken required' });
  }
  try {
    const store = storeManager.addStore({ name, shopifyDomain, shopifyToken, thresholdEuros });
    res.status(201).json(store);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/stores/:id/threshold
router.patch('/stores/:id/threshold', (req, res) => {
  const { threshold } = req.body;
  if (!threshold || isNaN(threshold)) return res.status(400).json({ error: 'Invalid threshold' });
  res.json(storeManager.updateStoreThreshold(parseInt(req.params.id), parseFloat(threshold)));
});

// POST /api/stores/:id/reset
router.post('/stores/:id/reset', (req, res) => {
  res.json(storeManager.resetStoreRevenue(parseInt(req.params.id)));
});

// PATCH /api/stores/:id/toggle
router.patch('/stores/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  res.json(storeManager.toggleStore(parseInt(req.params.id), enabled));
});

// POST /api/stores/:id/activate - forcer l'activation d'une boutique
router.post('/stores/:id/activate', (req, res) => {
  storeManager.activateStore(parseInt(req.params.id));
  res.json(storeManager.getStoreById(parseInt(req.params.id)));
});

// POST /api/rotate - forcer une rotation manuelle
router.post('/rotate', (req, res) => {
  const active = storeManager.getActiveStore();
  if (!active) return res.status(400).json({ error: 'No active store found' });
  const next = storeManager.rotateToNextStore(active.id, 'manual');
  res.json({ previous: active, next });
});

// GET /api/redirect - endpoint pour le proxy de redirection client
router.get('/redirect', (req, res) => {
  const active = storeManager.getActiveStore();
  if (!active) return res.status(503).json({ error: 'No active store available' });

  const protocol = process.env.SHOPIFY_PROTOCOL || 'https';
  res.json({
    store: active.name,
    url: `${protocol}://${active.shopify_domain}`,
    domain: active.shopify_domain,
  });
});

// GET /api/ai/insights - derniers insights IA
router.get('/ai/insights', async (req, res) => {
  try {
    const insights = await aiService.getLatestInsights(10);
    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/generate - générer un insight IA à la demande
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
