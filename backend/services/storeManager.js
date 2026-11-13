const { client } = require('../db/database');

async function getActiveStore() {
  const r = await client.execute('SELECT * FROM stores WHERE is_active = 1 AND is_enabled = 1 LIMIT 1');
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

async function activateStore(storeId) {
  await client.batch([
    'UPDATE stores SET is_active = 0',
    { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [storeId] },
  ], 'write');
}

async function rotateToNextStore(currentStoreId, reason = 'threshold_reached') {
  const currentStore = await getStoreById(currentStoreId);

  const r = await client.execute({
    sql: `SELECT * FROM stores WHERE is_enabled = 1 AND id != ? AND current_revenue < threshold_euros ORDER BY id ASC LIMIT 1`,
    args: [currentStoreId],
  });
  let nextStore = r.rows[0] || null;

  if (!nextStore) {
    const r2 = await client.execute('SELECT * FROM stores WHERE is_enabled = 1 ORDER BY id ASC LIMIT 1');
    const firstStore = r2.rows[0] || null;
    if (firstStore) {
      await client.batch([
        { sql: "UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?", args: [firstStore.id] },
        'UPDATE stores SET is_active = 0',
        { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [firstStore.id] },
        { sql: 'INSERT INTO rotations (from_store_id, to_store_id, reason, revenue_at_rotation) VALUES (?, ?, ?, ?)', args: [currentStoreId, firstStore.id, reason + '_reset', currentStore?.current_revenue || 0] },
      ], 'write');
      return firstStore;
    }
    return null;
  }

  await client.batch([
    { sql: "UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?", args: [currentStoreId] },
    'UPDATE stores SET is_active = 0',
    { sql: 'UPDATE stores SET is_active = 1 WHERE id = ?', args: [nextStore.id] },
    { sql: 'INSERT INTO rotations (from_store_id, to_store_id, reason, revenue_at_rotation) VALUES (?, ?, ?, ?)', args: [currentStoreId, nextStore.id, reason, currentStore?.current_revenue || 0] },
  ], 'write');

  return nextStore;
}

async function recordOrder(storeId, orderData) {
  const { shopifyOrderId, orderNumber, customerEmail, customerName, totalPrice, currency, itemsCount } = orderData;

  const existing = await client.execute({ sql: 'SELECT id FROM orders WHERE shopify_order_id = ?', args: [shopifyOrderId] });
  if (existing.rows[0]) return null;

  await client.execute({
    sql: 'INSERT INTO orders (store_id, shopify_order_id, order_number, customer_email, customer_name, total_price, currency, items_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [storeId, shopifyOrderId, orderNumber, customerEmail, customerName, totalPrice, currency || 'EUR', itemsCount || 0],
  });

  const updatedR = await client.execute({
    sql: `UPDATE stores SET current_revenue = current_revenue + ?, total_revenue = total_revenue + ?, total_orders = total_orders + 1 WHERE id = ? RETURNING *`,
    args: [totalPrice, totalPrice, storeId],
  });
  const updatedStore = updatedR.rows[0];

  if (updatedStore && updatedStore.current_revenue >= updatedStore.threshold_euros) {
    const nextStore = await rotateToNextStore(storeId, 'threshold_reached');
    return { order: updatedStore, rotated: true, nextStore };
  }

  return { order: updatedStore, rotated: false };
}

async function getStats() {
  const stores = await getAllStores();
  const totalR = await client.execute('SELECT SUM(total_revenue) as total FROM stores');
  const totalRevenue = totalR.rows[0]?.total || 0;
  const ordersR = await client.execute('SELECT SUM(total_orders) as total FROM stores');
  const totalOrders = ordersR.rows[0]?.total || 0;
  const recentOrdersR = await client.execute(`
    SELECT o.*, s.name as store_name, s.shopify_domain
    FROM orders o JOIN stores s ON o.store_id = s.id
    ORDER BY o.created_at DESC LIMIT 50
  `);
  const recentOrders = recentOrdersR.rows;
  const rotationsR = await client.execute(`
    SELECT r.*, sf.name as from_store_name, st.name as to_store_name
    FROM rotations r
    LEFT JOIN stores sf ON r.from_store_id = sf.id
    JOIN stores st ON r.to_store_id = st.id
    ORDER BY r.created_at DESC LIMIT 20
  `);
  const rotations = rotationsR.rows;
  return { stores, totalRevenue, totalOrders, recentOrders, rotations };
}

async function addStore(data) {
  const { name, shopifyDomain, shopifyToken, thresholdEuros = 250 } = data;
  const countR = await client.execute('SELECT COUNT(*) as count FROM stores');
  const storeCount = Number(countR.rows[0]?.count || 0);
  const r = await client.execute({
    sql: 'INSERT INTO stores (name, shopify_domain, shopify_token, threshold_euros, is_active) VALUES (?, ?, ?, ?, ?)',
    args: [name, shopifyDomain, shopifyToken, thresholdEuros, storeCount === 0 ? 1 : 0],
  });
  return getStoreById(Number(r.lastInsertRowid));
}

async function updateStoreThreshold(storeId, threshold) {
  await client.execute({ sql: 'UPDATE stores SET threshold_euros = ? WHERE id = ?', args: [threshold, storeId] });
  return getStoreById(storeId);
}

async function resetStoreRevenue(storeId) {
  await client.execute({ sql: "UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?", args: [storeId] });
  return getStoreById(storeId);
}

async function toggleStore(storeId, enabled) {
  await client.execute({ sql: 'UPDATE stores SET is_enabled = ? WHERE id = ?', args: [enabled ? 1 : 0, storeId] });
  return getStoreById(storeId);
}

module.exports = {
  getActiveStore, getAllStores, getStoreById, activateStore,
  rotateToNextStore, recordOrder, getStats, addStore,
  updateStoreThreshold, resetStoreRevenue, toggleStore,
};
