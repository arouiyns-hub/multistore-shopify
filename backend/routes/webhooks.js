const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const storeManager = require('../services/storeManager');

function verifyShopifyWebhook(req, secret) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac || !secret) return false;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

router.post('/:storeId/orders/paid', express.raw({ type: 'application/json' }), async (req, res) => {
  const { storeId } = req.params;
  const store = await storeManager.getStoreById(parseInt(storeId));

  if (!store) return res.status(404).json({ error: 'Store not found' });

  if (!verifyShopifyWebhook(req, store.shopify_token)) {
    return res.status(401).json({ error: 'Invalid HMAC' });
  }

  let order;
  try {
    order = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const result = await storeManager.recordOrder(parseInt(storeId), {
    shopifyOrderId: String(order.id),
    orderNumber: order.order_number ? String(order.order_number) : null,
    customerEmail: order.email || null,
    customerName: order.customer
      ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
      : null,
    totalPrice: parseFloat(order.total_price || 0),
    currency: order.currency || 'EUR',
    itemsCount: order.line_items ? order.line_items.length : 0,
  });

  if (result) {
    const wss = req.app.get('wss');
    if (wss) {
      const payload = JSON.stringify({
        type: result.rotated ? 'rotation' : 'new_order',
        data: result,
      });
      wss.clients.forEach((c) => {
        if (c.readyState === 1) c.send(payload);
      });
    }
  }

  res.status(200).json({ received: true });
});

router.post('/generic', express.raw({ type: 'application/json' }), async (req, res) => {
  const shopDomain = req.headers['x-shopify-shop-domain'];
  if (!shopDomain) return res.status(400).json({ error: 'Missing shop domain' });

  const stores = await storeManager.getAllStores();
  const store = stores.find((s) => s.shopify_domain === shopDomain);
  if (!store) return res.status(404).json({ error: 'Store not registered' });

  req.params = { storeId: String(store.id) };
  router.handle(req, res);
});

module.exports = router;
