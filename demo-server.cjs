// Serveur de démonstration — aucune dépendance native
const http = require('http');
const { WebSocketServer } = require('ws');

const API_KEY = 'demo-key-123';

// Données de démo en mémoire
const state = {
  stores: [
    { id: 1,  name: 'Boutique 01', shopify_domain: 'store-01.myshopify.com', shopify_token: 'tok_01', threshold_euros: 250, current_revenue: 234.50, total_revenue: 3200.00, total_orders: 41, is_active: 1, is_enabled: 1, reset_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 2,  name: 'Boutique 02', shopify_domain: 'store-02.myshopify.com', shopify_token: 'tok_02', threshold_euros: 250, current_revenue: 0,      total_revenue: 2890.00, total_orders: 37, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 3,  name: 'Boutique 03', shopify_domain: 'store-03.myshopify.com', shopify_token: 'tok_03', threshold_euros: 250, current_revenue: 0,      total_revenue: 2100.00, total_orders: 28, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 4,  name: 'Boutique 04', shopify_domain: 'store-04.myshopify.com', shopify_token: 'tok_04', threshold_euros: 250, current_revenue: 0,      total_revenue: 1980.00, total_orders: 25, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 10800000).toISOString() },
    { id: 5,  name: 'Boutique 05', shopify_domain: 'store-05.myshopify.com', shopify_token: 'tok_05', threshold_euros: 250, current_revenue: 0,      total_revenue: 1750.00, total_orders: 22, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 14400000).toISOString() },
    { id: 6,  name: 'Boutique 06', shopify_domain: 'store-06.myshopify.com', shopify_token: 'tok_06', threshold_euros: 250, current_revenue: 0,      total_revenue: 1540.00, total_orders: 19, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 18000000).toISOString() },
    { id: 7,  name: 'Boutique 07', shopify_domain: 'store-07.myshopify.com', shopify_token: 'tok_07', threshold_euros: 250, current_revenue: 0,      total_revenue: 1320.00, total_orders: 17, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 21600000).toISOString() },
    { id: 8,  name: 'Boutique 08', shopify_domain: 'store-08.myshopify.com', shopify_token: 'tok_08', threshold_euros: 250, current_revenue: 0,      total_revenue: 1100.00, total_orders: 14, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 25200000).toISOString() },
    { id: 9,  name: 'Boutique 09', shopify_domain: 'store-09.myshopify.com', shopify_token: 'tok_09', threshold_euros: 250, current_revenue: 0,      total_revenue:  890.00, total_orders: 11, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 28800000).toISOString() },
    { id: 10, name: 'Boutique 10', shopify_domain: 'store-10.myshopify.com', shopify_token: 'tok_10', threshold_euros: 250, current_revenue: 0,      total_revenue:  620.00, total_orders:  8, is_active: 0, is_enabled: 1, reset_at: new Date(Date.now() - 32400000).toISOString() },
  ],
  orders: Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    store_id: (i % 10) + 1,
    store_name: `Boutique ${String((i % 10) + 1).padStart(2, '0')}`,
    shopify_order_id: `${5000 + i}`,
    order_number: `#${1000 + i}`,
    customer_email: `client${i + 1}@exemple.com`,
    customer_name: ['Marie Dupont', 'Lucas Martin', 'Sophie Petit', 'Thomas Bernard', 'Emma Leroy', 'Noah Moreau', 'Léa Simon', 'Hugo Laurent', 'Camille Roux', 'Maxime Garcia'][i % 10],
    total_price: parseFloat((15 + Math.random() * 85).toFixed(2)),
    currency: 'EUR',
    status: 'paid',
    items_count: Math.floor(1 + Math.random() * 4),
    created_at: new Date(Date.now() - i * 1800000).toISOString(),
  })),
  rotations: [
    { id: 1, from_store_name: 'Boutique Beta', to_store_name: 'Boutique Alpha', reason: 'threshold_reached', revenue_at_rotation: 250, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, from_store_name: 'Boutique Alpha', to_store_name: 'Boutique Beta', reason: 'threshold_reached', revenue_at_rotation: 250, created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 3, from_store_name: null, to_store_name: 'Boutique Alpha', reason: 'manual', revenue_at_rotation: 0, created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  insights: [
    { id: 1, type: 'daily_summary', content: '• **Performance globale** : 68 commandes aujourd\'hui pour 2 310€ de CA total\n• **Boutique la plus performante** : Alpha avec 31 commandes et 2 340€ de CA cumulé\n• **Alerte** : Alpha approche du seuil (187€/250€ = 75%), rotation prévisible dans ~2h\n• **Conseil** : Augmenter le seuil à 300€ sur Gamma pour optimiser la charge', created_at: new Date(Date.now() - 3600000).toISOString() },
  ],
  nextOrderId: 21,
};

function getStats() {
  return {
    stores: state.stores,
    totalRevenue: state.stores.reduce((s, x) => s + x.total_revenue, 0),
    totalOrders: state.stores.reduce((s, x) => s + x.total_orders, 0),
    recentOrders: state.orders.slice(0, 50),
    rotations: state.rotations,
  };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-api-key');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const key = req.headers['x-api-key'] || new URL(req.url, 'http://x').searchParams.get('key');
  const url = req.url.split('?')[0];

  if (url === '/health') return json(res, { status: 'ok', mode: 'demo' });

  if (!key || key !== API_KEY) return json(res, { error: 'Unauthorized' }, 401);

  // GET /api/stats
  if (req.method === 'GET' && url === '/api/stats') return json(res, getStats());

  // GET /api/stores
  if (req.method === 'GET' && url === '/api/stores') return json(res, state.stores);

  // GET /api/redirect
  if (req.method === 'GET' && url === '/api/redirect') {
    const active = state.stores.find((s) => s.is_active);
    if (!active) return json(res, { error: 'No active store' }, 503);
    return json(res, { store: active.name, url: `https://${active.shopify_domain}`, domain: active.shopify_domain });
  }

  // GET /api/ai/insights
  if (req.method === 'GET' && url === '/api/ai/insights') return json(res, state.insights);

  // POST /api/ai/generate
  if (req.method === 'POST' && url === '/api/ai/generate') {
    const insight = {
      id: state.insights.length + 1,
      type: 'daily_summary',
      content: `• **Performance** : ${state.stores.reduce((s, x) => s + x.total_orders, 0)} commandes au total pour ${state.stores.reduce((s, x) => s + x.total_revenue, 0).toFixed(2)}€\n• **Boutique active** : ${state.stores.find((s) => s.is_active)?.name}\n• **Conseil** : Le rythme de rotation est normal, continuez ainsi.`,
      created_at: new Date().toISOString(),
    };
    state.insights.unshift(insight);
    return json(res, { insight: insight.content });
  }

  // POST /api/rotate
  if (req.method === 'POST' && url === '/api/rotate') {
    const current = state.stores.find((s) => s.is_active);
    if (!current) return json(res, { error: 'No active store' }, 400);
    const revenueAtRotation = current.current_revenue;
    const nextIdx = (state.stores.indexOf(current) + 1) % state.stores.length;
    const next = state.stores[nextIdx];
    current.current_revenue = 0;
    current.reset_at = new Date().toISOString();
    state.stores.forEach((s) => (s.is_active = 0));
    next.is_active = 1;
    state.rotations.unshift({ id: state.rotations.length + 1, from_store_name: current.name, to_store_name: next.name, reason: 'manual', revenue_at_rotation: revenueAtRotation, created_at: new Date().toISOString() });
    broadcast({ type: 'rotation', data: { previous: current, next } });
    return json(res, { previous: current, next });
  }

  // Store-specific routes
  const storeMatch = url.match(/^\/api\/stores\/(\d+)(\/.*)?$/);
  if (storeMatch) {
    const id = parseInt(storeMatch[1]);
    const sub = storeMatch[2] || '';
    const store = state.stores.find((s) => s.id === id);
    if (!store) return json(res, { error: 'Store not found' }, 404);

    if (req.method === 'POST' && sub === '/reset') { store.current_revenue = 0; return json(res, store); }
    if (req.method === 'POST' && sub === '/activate') {
      state.stores.forEach((s) => (s.is_active = 0));
      store.is_active = 1;
      return json(res, store);
    }
    if (req.method === 'PATCH' && sub === '/toggle') {
      const body = await readBody(req);
      store.is_enabled = body.enabled ? 1 : 0;
      return json(res, store);
    }
    if (req.method === 'PATCH' && sub === '/threshold') {
      const body = await readBody(req);
      store.threshold_euros = parseFloat(body.threshold);
      return json(res, store);
    }
  }

  // POST /api/stores (add store)
  if (req.method === 'POST' && url === '/api/stores') {
    const body = await readBody(req);
    const newStore = { id: state.stores.length + 1, name: body.name, shopify_domain: body.shopifyDomain, shopify_token: body.shopifyToken, threshold_euros: body.thresholdEuros || 250, current_revenue: 0, total_revenue: 0, total_orders: 0, is_active: 0, is_enabled: 1, reset_at: new Date().toISOString() };
    state.stores.push(newStore);
    return json(res, newStore, 201);
  }

  json(res, { error: 'Not found' }, 404);
});

// WebSocket
const wss = new WebSocketServer({ server });
function broadcast(data) {
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(JSON.stringify(data)); });
}

// Simule une commande toutes les 30s pour la démo
setInterval(() => {
  const active = state.stores.find((s) => s.is_active);
  if (!active) return;
  const amount = parseFloat((15 + Math.random() * 60).toFixed(2));
  const order = {
    id: state.nextOrderId++,
    store_id: active.id,
    store_name: active.name,
    shopify_order_id: String(5000 + state.nextOrderId),
    order_number: `#${1000 + state.nextOrderId}`,
    customer_email: `demo${state.nextOrderId}@exemple.com`,
    customer_name: ['Marie Dupont', 'Lucas Martin', 'Sophie Petit'][state.nextOrderId % 3],
    total_price: amount,
    currency: 'EUR',
    status: 'paid',
    items_count: 1,
    created_at: new Date().toISOString(),
  };
  state.orders.unshift(order);
  active.current_revenue += amount;
  active.total_revenue += amount;
  active.total_orders += 1;

  let rotated = false;
  if (active.current_revenue >= active.threshold_euros) {
    const revenueAtRotation = active.current_revenue;
    const activeIdx = state.stores.indexOf(active);
    const nextIdx = (activeIdx + 1) % state.stores.length;
    const next = state.stores[nextIdx];
    active.current_revenue = 0;
    active.reset_at = new Date().toISOString();
    state.stores.forEach((s) => (s.is_active = 0));
    next.is_active = 1;
    state.rotations.unshift({ id: state.rotations.length + 1, from_store_name: active.name, to_store_name: next.name, reason: 'threshold_reached', revenue_at_rotation: revenueAtRotation, created_at: new Date().toISOString() });
    rotated = true;
    broadcast({ type: 'rotation', data: { previous: active, next } });
  }

  broadcast({ type: 'new_order', data: { order, rotated } });
  console.log(`[DEMO] Commande simulée +${amount}€ sur ${active.name} (CA: ${active.current_revenue.toFixed(2)}€/${active.threshold_euros}€)${rotated ? ' → ROTATION!' : ''}`);
}, 15000);

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n🎮 Serveur DÉMO démarré sur http://localhost:${PORT}`);
  console.log(`🔑 API Key : ${API_KEY}`);
  console.log(`📡 WebSocket actif — commandes simulées toutes les 30s\n`);
});
