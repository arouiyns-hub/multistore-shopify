const db = require('../db/database');

function getActiveStore() {
  return db.prepare('SELECT * FROM stores WHERE is_active = 1 AND is_enabled = 1 LIMIT 1').get();
}

function getAllStores() {
  return db.prepare('SELECT * FROM stores ORDER BY id ASC').all();
}

function getStoreById(id) {
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
}

function activateStore(storeId) {
  db.prepare('UPDATE stores SET is_active = 0').run();
  db.prepare('UPDATE stores SET is_active = 1 WHERE id = ?').run(storeId);
}

function rotateToNextStore(currentStoreId, reason = 'threshold_reached') {
  const currentStore = getStoreById(currentStoreId);

  const nextStore = db.prepare(`
    SELECT * FROM stores
    WHERE is_enabled = 1
    AND id != ?
    AND current_revenue < threshold_euros
    ORDER BY id ASC
    LIMIT 1
  `).get(currentStoreId);

  if (!nextStore) {
    const firstStore = db.prepare(`
      SELECT * FROM stores WHERE is_enabled = 1 ORDER BY id ASC LIMIT 1
    `).get();

    if (firstStore) {
      db.prepare('UPDATE stores SET current_revenue = 0, reset_at = datetime(\'now\') WHERE id = ?').run(firstStore.id);
      activateStore(firstStore.id);

      db.prepare(`
        INSERT INTO rotations (from_store_id, to_store_id, reason, revenue_at_rotation)
        VALUES (?, ?, ?, ?)
      `).run(currentStoreId, firstStore.id, reason + '_reset', currentStore?.current_revenue || 0);

      return firstStore;
    }
    return null;
  }

  db.prepare(`UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?`).run(currentStoreId);

  activateStore(nextStore.id);

  db.prepare(`
    INSERT INTO rotations (from_store_id, to_store_id, reason, revenue_at_rotation)
    VALUES (?, ?, ?, ?)
  `).run(currentStoreId, nextStore.id, reason, currentStore?.current_revenue || 0);

  return nextStore;
}

function recordOrder(storeId, orderData) {
  const { shopifyOrderId, orderNumber, customerEmail, customerName, totalPrice, currency, itemsCount } = orderData;

  const existing = db.prepare('SELECT id FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
  if (existing) return null;

  db.prepare(`
    INSERT INTO orders (store_id, shopify_order_id, order_number, customer_email, customer_name, total_price, currency, items_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(storeId, shopifyOrderId, orderNumber, customerEmail, customerName, totalPrice, currency || 'EUR', itemsCount || 0);

  const updatedStore = db.prepare(`
    UPDATE stores
    SET current_revenue = current_revenue + ?,
        total_revenue = total_revenue + ?,
        total_orders = total_orders + 1
    WHERE id = ?
    RETURNING *
  `).get(totalPrice, totalPrice, storeId);

  if (updatedStore && updatedStore.current_revenue >= updatedStore.threshold_euros) {
    const nextStore = rotateToNextStore(storeId, 'threshold_reached');
    return { order: updatedStore, rotated: true, nextStore };
  }

  return { order: updatedStore, rotated: false };
}

function getStats() {
  const stores = getAllStores();
  const totalRevenue = db.prepare('SELECT SUM(total_revenue) as total FROM stores').get().total || 0;
  const totalOrders = db.prepare('SELECT SUM(total_orders) as total FROM stores').get().total || 0;
  const recentOrders = db.prepare(`
    SELECT o.*, s.name as store_name, s.shopify_domain
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    ORDER BY o.created_at DESC
    LIMIT 50
  `).all();
  const rotations = db.prepare(`
    SELECT r.*,
      sf.name as from_store_name,
      st.name as to_store_name
    FROM rotations r
    LEFT JOIN stores sf ON r.from_store_id = sf.id
    JOIN stores st ON r.to_store_id = st.id
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all();

  return { stores, totalRevenue, totalOrders, recentOrders, rotations };
}

function addStore(data) {
  const { name, shopifyDomain, shopifyToken, thresholdEuros = 250 } = data;
  const storeCount = db.prepare('SELECT COUNT(*) as count FROM stores').get().count;

  const result = db.prepare(`
    INSERT INTO stores (name, shopify_domain, shopify_token, threshold_euros, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, shopifyDomain, shopifyToken, thresholdEuros, storeCount === 0 ? 1 : 0);

  return getStoreById(result.lastInsertRowid);
}

function updateStoreThreshold(storeId, threshold) {
  db.prepare('UPDATE stores SET threshold_euros = ? WHERE id = ?').run(threshold, storeId);
  return getStoreById(storeId);
}

function resetStoreRevenue(storeId) {
  db.prepare(`UPDATE stores SET current_revenue = 0, reset_at = datetime('now') WHERE id = ?`).run(storeId);
  return getStoreById(storeId);
}

function toggleStore(storeId, enabled) {
  db.prepare('UPDATE stores SET is_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, storeId);
  return getStoreById(storeId);
}

module.exports = {
  getActiveStore,
  getAllStores,
  getStoreById,
  activateStore,
  rotateToNextStore,
  recordOrder,
  getStats,
  addStore,
  updateStoreThreshold,
  resetStoreRevenue,
  toggleStore,
};
