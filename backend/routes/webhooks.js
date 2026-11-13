const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const storeManager = require('../services/storeManager');
const { state: dbState } = require('../db/database');

function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('base64'));
  const received = Buffer.from(String(hmacHeader));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function broadcast(req, payload) {
  const wss = req.app.get('wss');
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

async function handleOrderPaid(req, res, store) {
  if (!store) return res.status(404).json({ error: 'Boutique non enregistrée' });

  if (!verifyShopifyHmac(req.body, req.headers['x-shopify-hmac-sha256'], store.shopify_token)) {
    console.warn(`[WEBHOOK] Signature invalide pour « ${store.name} » (vérifie le secret webhook dans le panel)`);
    return res.status(401).json({ error: 'Signature HMAC invalide' });
  }

  let order;
  try {
    order = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  if (!order || order.id == null) return res.status(400).json({ error: 'Commande sans identifiant' });

  const customer = order.customer || {};
  const result = await storeManager.recordOrder(store.id, {
    shopifyOrderId: `${store.id}:${order.id}`,
    orderNumber: order.order_number != null ? String(order.order_number) : order.name ? String(order.name).replace(/^#/, '') : null,
    customerEmail: order.email || order.contact_email || customer.email || null,
    customerName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || null,
    totalPrice: parseFloat(order.total_price || order.current_total_price || 0),
    currency: order.currency || 'EUR',
    itemsCount: Array.isArray(order.line_items) ? order.line_items.reduce((n, li) => n + (Number(li.quantity) || 1), 0) : 0,
  });

  if (!result) {
    console.log(`[WEBHOOK] Commande ${order.id} déjà enregistrée pour « ${store.name} » (ignorée)`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  console.log(
    `[WEBHOOK] « ${store.name} » +${result.order.total_price} ${result.order.currency} → cycle ${result.store.current_revenue}/${result.store.threshold_euros}` +
      (result.rotated ? ` → ROTATION vers « ${result.nextStore?.name || 'aucune'} »` : ''),
  );

  const data = {
    store: storeManager.publicStore(result.store),
    order: result.order,
    rotated: result.rotated,
    nextStore: storeManager.publicStore(result.nextStore),
  };
  broadcast(req, { type: 'new_order', data });
  if (result.rotated) broadcast(req, { type: 'rotation', data });

  res.status(200).json({ received: true, rotated: result.rotated });
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  if (!dbState.ready) return res.status(503).json({ error: 'Base de données indisponible' });
  next();
});

// URL recommandée : /webhooks/<id>/orders/paid
router.post('/:storeId(\\d+)/orders/paid', wrap(async (req, res) => {
  const store = await storeManager.getStoreById(Number(req.params.storeId));
  await handleOrderPaid(req, res, store);
}));

// Variante sans id : la boutique est retrouvée via l'en-tête X-Shopify-Shop-Domain.
router.post(['/orders/paid', '/generic'], wrap(async (req, res) => {
  const domain = req.headers['x-shopify-shop-domain'];
  if (!domain) return res.status(400).json({ error: 'En-tête X-Shopify-Shop-Domain manquant' });
  const store = await storeManager.getStoreByDomain(domain);
  await handleOrderPaid(req, res, store);
}));

router.use((err, req, res, next) => {
  console.error('[WEBHOOK] Erreur', req.originalUrl, err);
  res.status(500).json({ error: 'Erreur serveur' });
});

module.exports = router;
