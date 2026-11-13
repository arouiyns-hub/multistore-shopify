const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

async function initDb() {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      shopify_domain TEXT NOT NULL UNIQUE,
      shopify_token TEXT NOT NULL,
      threshold_euros REAL DEFAULT 250,
      current_revenue REAL DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      reset_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      shopify_order_id TEXT NOT NULL UNIQUE,
      order_number TEXT,
      customer_email TEXT,
      customer_name TEXT,
      total_price REAL NOT NULL,
      currency TEXT DEFAULT 'EUR',
      status TEXT DEFAULT 'paid',
      items_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (store_id) REFERENCES stores(id)
    )`,
    `CREATE TABLE IF NOT EXISTS rotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_store_id INTEGER,
      to_store_id INTEGER NOT NULL,
      reason TEXT,
      revenue_at_rotation REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS ai_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      data_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ], 'write');
}

module.exports = { client, initDb };
