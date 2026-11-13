const { client } = require('../db/database');

// Toutes les écritures passent par cette file : une seule mutation à la fois,
// donc deux commandes simultanées ne peuvent pas déclencher deux rotations.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(() => fn());
  queue = run.catch(() => {});
  return run;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const num = (v) => Number(v) || 0;

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '');
}

async function getActiveStore() {
  const r = await client.execute('SELECT * FROM stores WHERE is_active = 1 AND is_enabled = 1 ORDER BY id ASC LIMIT 1');
  return r.rows[0] || null;
}

async function getAllStores() {
  const r = await client.execute('SELECT * FROM stores ORDER BY id ASC');
  return r.rows;
}

async function getStoreById(id) {
  const r = await client.execute({ sql: 'SELECT * FROM stores WHERE id = ?', args: [id] });
  return r.rows[0] || null;
}

async function getStoreByDomain(domain) {
  const r = await client.execute({
    sql: 'SELECT * FROM stores WHERE shopify_domain = ? LIMIT 1',
    args: [normalizeDomain(domain)],
  });
  return r.rows[0] || null;
}

// Boutique suivante dans l'ordre des id (en bouclant), qui n'a pas encore atteint son seuil.
async function pickNextStore(currentId) {
  const r = await client.execute('SELECT * FROM stores WHERE is_enabled = 1 ORDER BY id ASC');
  const enabled = r.rows;
  const others = [
    ...enabled.filter((s) => s.id > currentId),
    ...enabled.filter((s) => s.id < currentId),
  ];
  const withRoom = others.find((s) => num(s.current_revenue) < num(s.threshold_euros));
  if (withRoom) return { store: withRoom, resetTarget: false };
  if (others.length) return { store: others[0], resetTarget: true };
  const self = enabled.find((s) => s.id === currentId);
  if (self) return { store: self, resetTarget: true };
  return { store: null, resetTarget: false };
}

async function rotateFromUnlocked(fromStore, reason, { resetFrom = true } = {}) {
  const fromId = fromStore ? fromStore.id : 0;
  const { store: next, resetTarget } = await pickNextStore(fromId);
  const stmts = [];

  if (fromStore && resetFrom) {
    stmts.push({ sql: "UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?", args: [fromStore.id] });
  }
  stmts.push('UPDATE stores SET is_active = 0 WHERE is_active = 1');
  if (next) {
    if (resetTarget && next.id !== fromId) {
      stmts.push({ sql: "UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?", args: [next.id] });
    }
    stmts.push({ sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [next.id] });
    stmts.push({
      sql: 'INSERT INTO rotations (from_store_id, to_store_id, reason, revenue_at_rotation) VALUES (?, ?, ?, ?)',
      args: [fromStore ? fromStore.id : null, next.id, resetTarget ? `${reason}_reset` : reason, fromStore ? num(fromStore.current_revenue) : 0],
    });
  }
  await client.batch(stmts, 'write');
  return next ? getStoreById(next.id) : null;
}

function rotateToNextStore(currentStoreId, reason = 'manual') {
  return exclusive(async () => {
    const current = await getStoreById(currentStoreId);
    return rotateFromUnlocked(current, reason);
  });
}

function manualRotate() {
  return exclusive(async () => {
    const previous = await getActiveStore();
    const next = await rotateFromUnlocked(previous, 'manual');
    return { previous, next };
  });
}

function recordOrder(storeId, orderData) {
  return exclusive(async () => {
    const { shopifyOrderId, orderNumber, customerEmail, customerName, totalPrice, currency, itemsCount } = orderData;
    const amount = Math.round(num(totalPrice) * 100) / 100;

    // L'insertion et la mise à jour du CA sont dans la même transaction :
    // changes() = 0 si la commande existait déjà (webhook rejoué par Shopify).
    const [ins, upd] = await client.batch([
      {
        sql: 'INSERT OR IGNORE INTO orders (store_id, shopify_order_id, order_number, customer_email, customer_name, total_price, currency, items_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [storeId, shopifyOrderId, orderNumber, customerEmail, customerName, amount, currency || 'EUR', itemsCount || 0],
      },
      {
        sql: `UPDATE stores
              SET current_revenue = ROUND(current_revenue + ?, 2),
                  total_revenue = ROUND(total_revenue + ?, 2),
                  total_orders = total_orders + 1
              WHERE id = ? AND changes() = 1
              RETURNING *`,
        args: [amount, amount, storeId],
      },
    ], 'write');

    if (ins.rowsAffected === 0) return null;
    const store = upd.rows[0];
    if (!store) return null;

    const order = { shopify_order_id: shopifyOrderId, order_number: orderNumber, total_price: amount, currency: currency || 'EUR' };

    // Seule la boutique active déclenche une rotation : une commande tardive
    // sur une ancienne boutique ne doit pas changer la boutique active.
    if (store.is_active && store.is_enabled && num(store.current_revenue) >= num(store.threshold_euros)) {
      const nextStore = await rotateFromUnlocked(store, 'threshold_reached');
      return { store, order, rotated: true, nextStore };
    }
    return { store, order, rotated: false, nextStore: null };
  });
}

async function getStats() {
  const [storesR, totalsR, recentR, rotationsR] = await Promise.all([
    client.execute('SELECT * FROM stores ORDER BY id ASC'),
    client.execute('SELECT COALESCE(SUM(total_revenue), 0) AS revenue, COALESCE(SUM(total_orders), 0) AS orders FROM stores'),
    client.execute(`
      SELECT o.*, s.name AS store_name, s.shopify_domain
      FROM orders o JOIN stores s ON o.store_id = s.id
      ORDER BY o.created_at DESC, o.id DESC LIMIT 50
    `),
    client.execute(`
      SELECT r.*, sf.name AS from_store_name, st.name AS to_store_name
      FROM rotations r
      LEFT JOIN stores sf ON r.from_store_id = sf.id
      JOIN stores st ON r.to_store_id = st.id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 20
    `),
  ]);
  return {
    stores: storesR.rows.map(publicStore),
    totalRevenue: Math.round(num(totalsR.rows[0]?.revenue) * 100) / 100,
    totalOrders: num(totalsR.rows[0]?.orders),
    recentOrders: recentR.rows,
    rotations: rotationsR.rows,
  };
}

// Le secret webhook ne quitte jamais le serveur.
function publicStore(store) {
  if (!store) return store;
  const { shopify_token, ...rest } = store;
  return { ...rest, has_secret: Boolean(shopify_token) };
}

function addStore({ name, shopifyDomain, shopifyToken, thresholdEuros }) {
  return exclusive(async () => {
    const threshold = thresholdEuros == null || thresholdEuros === '' ? 250 : num(thresholdEuros);
    if (!(threshold > 0)) throw new HttpError(400, 'Seuil invalide');
    const domain = normalizeDomain(shopifyDomain);
    if (await getStoreByDomain(domain)) throw new HttpError(409, 'Ce domaine Shopify est déjà enregistré.');

    const r = await client.execute({
      sql: 'INSERT INTO stores (name, shopify_domain, shopify_token, threshold_euros, is_active) VALUES (?, ?, ?, ?, 0)',
      args: [String(name).trim(), domain, String(shopifyToken).trim(), threshold],
    });
    const id = Number(r.lastInsertRowid);
    if (!(await getActiveStore())) {
      await client.batch([
        'UPDATE stores SET is_active = 0 WHERE is_active = 1',
        { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [id] },
      ], 'write');
    }
    return getStoreById(id);
  });
}

function updateStore(storeId, { name, shopifyDomain, shopifyToken }) {
  return exclusive(async () => {
    const store = await getStoreById(storeId);
    if (!store) throw new HttpError(404, 'Boutique introuvable');
    const sets = [];
    const args = [];
    if (name != null && String(name).trim()) {
      sets.push('name = ?');
      args.push(String(name).trim());
    }
    if (shopifyDomain != null && String(shopifyDomain).trim()) {
      const domain = normalizeDomain(shopifyDomain);
      const other = await getStoreByDomain(domain);
      if (other && other.id !== storeId) throw new HttpError(409, 'Ce domaine Shopify est déjà enregistré.');
      sets.push('shopify_domain = ?');
      args.push(domain);
    }
    if (shopifyToken != null && String(shopifyToken).trim()) {
      sets.push('shopify_token = ?');
      args.push(String(shopifyToken).trim());
    }
    if (sets.length) {
      await client.execute({ sql: `UPDATE stores SET ${sets.join(', ')} WHERE id = ?`, args: [...args, storeId] });
    }
    return getStoreById(storeId);
  });
}

function deleteStore(storeId) {
  return exclusive(async () => {
    const store = await getStoreById(storeId);
    if (!store) throw new HttpError(404, 'Boutique introuvable');
    await client.execute({ sql: 'UPDATE stores SET is_enabled = 0 WHERE id = ?', args: [storeId] });
    if (store.is_active) await rotateFromUnlocked(store, 'store_removed', { resetFrom: false });
    await client.batch([
      { sql: 'DELETE FROM orders WHERE store_id = ?', args: [storeId] },
      { sql: 'DELETE FROM rotations WHERE to_store_id = ? OR from_store_id = ?', args: [storeId, storeId] },
      { sql: 'DELETE FROM stores WHERE id = ?', args: [storeId] },
    ], 'write');
    return { deleted: true };
  });
}

function updateStoreThreshold(storeId, threshold) {
  return exclusive(async () => {
    if (!(await getStoreById(storeId))) throw new HttpError(404, 'Boutique introuvable');
    await client.execute({ sql: 'UPDATE stores SET threshold_euros = ? WHERE id = ?', args: [threshold, storeId] });
    const store = await getStoreById(storeId);
    if (store.is_active && store.is_enabled && num(store.current_revenue) >= num(store.threshold_euros)) {
      await rotateFromUnlocked(store, 'threshold_reached');
    }
    return getStoreById(storeId);
  });
}

function resetStoreRevenue(storeId) {
  return exclusive(async () => {
    if (!(await getStoreById(storeId))) throw new HttpError(404, 'Boutique introuvable');
    await client.execute({ sql: "UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?", args: [storeId] });
    return getStoreById(storeId);
  });
}

function toggleStore(storeId, enabled) {
  return exclusive(async () => {
    const store = await getStoreById(storeId);
    if (!store) throw new HttpError(404, 'Boutique introuvable');
    await client.execute({ sql: 'UPDATE stores SET is_enabled = ? WHERE id = ?', args: [enabled ? 1 : 0, storeId] });

    if (!enabled && store.is_active) {
      await rotateFromUnlocked(store, 'store_disabled', { resetFrom: false });
    } else if (enabled && !(await getActiveStore())) {
      await client.batch([
        'UPDATE stores SET is_active = 0 WHERE is_active = 1',
        { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [storeId] },
      ], 'write');
    }
    return getStoreById(storeId);
  });
}

function activateStore(storeId) {
  return exclusive(async () => {
    const store = await getStoreById(storeId);
    if (!store) throw new HttpError(404, 'Boutique introuvable');
    if (!store.is_enabled) throw new HttpError(400, 'Réactivez la boutique avant de l’activer');
    const previous = await getActiveStore();
    if (previous && previous.id === store.id) return store;

    await client.batch([
      'UPDATE stores SET is_active = 0 WHERE is_active = 1',
      { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [storeId] },
      {
        sql: 'INSERT INTO rotations (from_store_id, to_store_id, reason, revenue_at_rotation) VALUES (?, ?, ?, ?)',
        args: [previous ? previous.id : null, storeId, 'manual_activation', previous ? num(previous.current_revenue) : 0],
      },
    ], 'write');
    return getStoreById(storeId);
  });
}

// Au démarrage : s'il existe des boutiques actives-possibles mais aucune active, on en active une.
function ensureActiveStore() {
  return exclusive(async () => {
    if (await getActiveStore()) return;
    const r = await client.execute('SELECT id FROM stores WHERE is_enabled = 1 ORDER BY id ASC LIMIT 1');
    const first = r.rows[0];
    if (!first) return;
    await client.batch([
      'UPDATE stores SET is_active = 0 WHERE is_active = 1',
      { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [first.id] },
    ], 'write');
  });
}

module.exports = {
  HttpError,
  normalizeDomain,
  publicStore,
  getActiveStore,
  getAllStores,
  getStoreById,
  getStoreByDomain,
  activateStore,
  rotateToNextStore,
  manualRotate,
  recordOrder,
  getStats,
  addStore,
  updateStore,
  deleteStore,
  updateStoreThreshold,
  resetStoreRevenue,
  toggleStore,
  ensureActiveStore,
};
