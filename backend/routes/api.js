const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const storeManager = require('../services/storeManager');
const aiService = require('../services/aiService');
const { state: dbState } = require('../db/database');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function isValidKey(key) {
  const expected = process.env.ADMIN_API_KEY;
  return Boolean(expected) && safeEqual(key, expected);
}

router.use((req, res, next) => {
  if (!process.env.ADMIN_API_KEY) {
    return res.status(503).json({ error: 'ADMIN_API_KEY non configurée sur le serveur' });
  }
  if (!isValidKey(req.headers['x-api-key'])) {
    return res.status(401).json({ error: 'Clé admin invalide' });
  }
  if (!dbState.ready) {
    return res.status(503).json({ error: 'Base de données pas encore connectée, réessaie dans quelques secondes' });
  }
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function storeId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new storeManager.HttpError(400, 'Identifiant de boutique invalide');
  return id;
}

function broadcast(req, type, data) {
  const wss = req.app.get('wss');
  if (!wss) return;
  const payload = JSON.stringify({ type, data });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(payload);
  });
}

const pub = storeManager.publicStore;

router.get('/stats', wrap(async (req, res) => {
  res.json(await storeManager.getStats());
}));

router.get('/stores', wrap(async (req, res) => {
  res.json((await storeManager.getAllStores()).map(pub));
}));

router.post('/stores', wrap(async (req, res) => {
  const { name, shopifyDomain, shopifyToken, thresholdEuros } = req.body || {};
  if (!String(name || '').trim() || !String(shopifyDomain || '').trim() || !String(shopifyToken || '').trim()) {
    return res.status(400).json({ error: 'Nom, domaine et secret webhook sont obligatoires' });
  }
  const store = await storeManager.addStore({ name, shopifyDomain, shopifyToken, thresholdEuros });
  broadcast(req, 'stores_changed', {});
  res.status(201).json(pub(store));
}));

router.patch('/stores/:id', wrap(async (req, res) => {
  const { name, shopifyDomain, shopifyToken } = req.body || {};
  const store = await storeManager.updateStore(storeId(req), { name, shopifyDomain, shopifyToken });
  broadcast(req, 'stores_changed', {});
  res.json(pub(store));
}));

router.delete('/stores/:id', wrap(async (req, res) => {
  const result = await storeManager.deleteStore(storeId(req));
  broadcast(req, 'stores_changed', {});
  res.json(result);
}));

router.patch('/stores/:id/threshold', wrap(async (req, res) => {
  const threshold = Number(req.body?.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return res.status(400).json({ error: 'Seuil invalide' });
  const store = await storeManager.updateStoreThreshold(storeId(req), threshold);
  broadcast(req, 'stores_changed', {});
  res.json(pub(store));
}));

router.post('/stores/:id/reset', wrap(async (req, res) => {
  const store = await storeManager.resetStoreRevenue(storeId(req));
  broadcast(req, 'stores_changed', {});
  res.json(pub(store));
}));

router.patch('/stores/:id/toggle', wrap(async (req, res) => {
  const store = await storeManager.toggleStore(storeId(req), Boolean(req.body?.enabled));
  broadcast(req, 'stores_changed', {});
  res.json(pub(store));
}));

router.post('/stores/:id/activate', wrap(async (req, res) => {
  const store = await storeManager.activateStore(storeId(req));
  broadcast(req, 'stores_changed', {});
  res.json(pub(store));
}));

router.post('/rotate', wrap(async (req, res) => {
  const { previous, next } = await storeManager.manualRotate();
  if (!next) return res.status(400).json({ error: 'Aucune boutique activée disponible pour la rotation' });
  broadcast(req, 'stores_changed', {});
  res.json({ previous: pub(previous), next: pub(next) });
}));

router.get('/redirect', wrap(async (req, res) => {
  const active = await storeManager.getActiveStore();
  if (!active) return res.status(503).json({ error: 'Aucune boutique active' });
  res.json({ store: active.name, url: `https://${active.shopify_domain}`, domain: active.shopify_domain });
}));

router.get('/ai/insights', wrap(async (req, res) => {
  res.json({ enabled: aiService.isEnabled(), insights: await aiService.getLatestInsights(10) });
}));

router.post('/ai/generate', wrap(async (req, res) => {
  const insight = await aiService.generateInsight(req.body?.type || 'daily_summary');
  res.json({ insight });
}));

router.use((err, req, res, next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (!err.status) console.error('[API]', req.method, req.originalUrl, err);
  else if (status >= 500) console.warn('[API]', req.method, req.originalUrl, err.message);
  const message = /UNIQUE/i.test(err.message || '') ? 'Ce domaine Shopify est déjà enregistré.' : err.message || 'Erreur serveur';
  res.status(status).json({ error: message });
});

module.exports = router;
module.exports.isValidKey = isValidKey;
