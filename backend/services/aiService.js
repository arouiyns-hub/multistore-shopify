const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/database');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateInsight(type = 'daily_summary') {
  const stats = getStatsForAI();

  const prompts = {
    daily_summary: `Tu es un assistant e-commerce expert. Voici les données de mes boutiques Shopify :

${JSON.stringify(stats, null, 2)}

Génère un résumé quotidien concis (3-5 points) avec :
- Performance globale du jour
- Boutique la plus performante
- Alertes si nécessaire (rotation fréquente, boutique proche du seuil)
- 1 conseil d'optimisation
Réponds en français, format bullet points.`,

    rotation_analysis: `Tu es un expert en e-commerce multi-boutiques. Données de rotations récentes :

${JSON.stringify(stats.recentRotations, null, 2)}

Analyse ces rotations et dis-moi :
- Le rythme de rotation est-il normal ou trop rapide ?
- Faut-il ajuster le seuil de 250€ ?
- Y a-t-il des patterns inhabituels ?
Réponds en français, sois direct et concis.`,

    sales_forecast: `Données de ventes des 7 derniers jours :

${JSON.stringify(stats.salesHistory, null, 2)}

Fais une prévision simple pour les prochaines 24h et suggère si je dois :
- Préparer plus de stock
- Ajuster le seuil de rotation
- Surveiller une boutique en particulier
Réponds en français, 3-4 lignes maximum.`,
  };

  const prompt = prompts[type] || prompts.daily_summary;

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0].text;

  db.prepare(`
    INSERT INTO ai_insights (type, content, data_snapshot)
    VALUES (?, ?, ?)
  `).run(type, content, JSON.stringify(stats));

  return content;
}

function getStatsForAI() {
  const stores = db.prepare('SELECT id, name, current_revenue, total_revenue, total_orders, threshold_euros, is_active FROM stores').all();

  const recentOrders = db.prepare(`
    SELECT store_id, total_price, created_at
    FROM orders
    WHERE created_at >= datetime('now', '-7 days')
    ORDER BY created_at DESC
  `).all();

  const recentRotations = db.prepare(`
    SELECT r.reason, r.revenue_at_rotation, r.created_at,
      sf.name as from_store, st.name as to_store
    FROM rotations r
    LEFT JOIN stores sf ON r.from_store_id = sf.id
    JOIN stores st ON r.to_store_id = st.id
    WHERE r.created_at >= datetime('now', '-7 days')
    ORDER BY r.created_at DESC
  `).all();

  const dailyRevenue = db.prepare(`
    SELECT date(created_at) as day, SUM(total_price) as revenue, COUNT(*) as orders
    FROM orders
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day DESC
  `).all();

  return {
    stores,
    recentOrders: recentOrders.length,
    recentRotations,
    salesHistory: dailyRevenue,
    totalCurrentRevenue: stores.reduce((sum, s) => sum + s.current_revenue, 0),
  };
}

async function getLatestInsights(limit = 5) {
  return db.prepare(`
    SELECT * FROM ai_insights ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

module.exports = { generateInsight, getLatestInsights };
