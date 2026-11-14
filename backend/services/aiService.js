const { GoogleGenerativeAI } = require('@google/generative-ai');
const { client } = require('../db/database');

const MODEL = 'gemini-2.0-flash';

let genAI = null;

function isEnabled() {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

function getClient() {
  if (!isEnabled()) {
    const err = new Error("Assistant IA désactivé : ajoute la variable GEMINI_API_KEY sur Railway pour l'activer");
    err.status = 503;
    throw err;
  }
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
  return genAI;
}

const SYSTEM = `Tu es un analyste e-commerce qui conseille le propriétaire d'un réseau de boutiques Shopify.
Les boutiques tournent : une seule boutique est active à la fois et reçoit le trafic. Quand son CA du cycle (current_revenue) atteint son seuil (threshold_euros), la suivante devient active et le CA du cycle de l'ancienne repart à zéro. total_revenue est le CA cumulé depuis le début.
Réponds en français, en texte brut avec des puces "- ", sans titre ni markdown gras. Sois concret et appuie-toi uniquement sur les chiffres fournis ; si les données sont vides ou insuffisantes, dis-le simplement.`;

const PROMPTS = {
  daily_summary: (s) => `Données des boutiques :
${JSON.stringify(s, null, 2)}

Fais un résumé du jour en 3 à 5 puces : performance globale, boutique la plus performante, alertes éventuelles (rotations très fréquentes, boutique proche du seuil, boutique désactivée), et un conseil d'optimisation.`,

  rotation_analysis: (s) => `Rotations des 7 derniers jours :
${JSON.stringify(s.recentRotations, null, 2)}

Boutiques :
${JSON.stringify(s.stores, null, 2)}

Analyse en 3 à 5 puces : le rythme de rotation est-il normal ou trop rapide, faut-il ajuster les seuils, y a-t-il des anomalies.`,

  sales_forecast: (s) => `CA par jour sur les 7 derniers jours :
${JSON.stringify(s.salesHistory, null, 2)}

Boutiques :
${JSON.stringify(s.stores, null, 2)}

Fais une prévision simple pour les prochaines 24 h en 3 à 4 puces : volume attendu, nombre de rotations probables, boutique à surveiller.`,
};

async function generateInsight(type = 'daily_summary') {
  if (!PROMPTS[type]) {
    const err = new Error('Type d\'analyse inconnu');
    err.status = 400;
    throw err;
  }
  const ai = getClient();
  const stats = await getStatsForAI();

  const model = ai.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
  });

  let result;
  try {
    result = await model.generateContent(PROMPTS[type](stats));
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      err.message = 'Clé GEMINI_API_KEY invalide';
      err.status = 502;
    } else if (err.status === 429) {
      err.message = 'Limite de requêtes Gemini atteinte, réessaie dans une minute';
    } else {
      err.message = `Erreur API Gemini : ${err.message}`;
      err.status = 502;
    }
    throw err;
  }

  const content = result.response.text().trim();
  if (!content) {
    const err = new Error('Réponse vide de Gemini');
    err.status = 502;
    throw err;
  }

  await client.execute({
    sql: 'INSERT INTO ai_insights (type, content, data_snapshot) VALUES (?, ?, ?)',
    args: [type, content, JSON.stringify(stats)],
  });
  return content;
}

async function getStatsForAI() {
  const [storesR, ordersR, rotationsR, dailyR] = await Promise.all([
    client.execute('SELECT id, name, current_revenue, total_revenue, total_orders, threshold_euros, is_active, is_enabled FROM stores ORDER BY id'),
    client.execute(`SELECT COUNT(*) AS n FROM orders WHERE created_at >= datetime('now', '-7 days')`),
    client.execute(
      `SELECT r.reason, r.revenue_at_rotation, r.created_at, sf.name AS from_store, st.name AS to_store
       FROM rotations r
       LEFT JOIN stores sf ON r.from_store_id = sf.id
       JOIN stores st ON r.to_store_id = st.id
       WHERE r.created_at >= datetime('now', '-7 days')
       ORDER BY r.created_at DESC LIMIT 100`,
    ),
    client.execute(
      `SELECT date(created_at) AS day, ROUND(SUM(total_price), 2) AS revenue, COUNT(*) AS orders
       FROM orders WHERE created_at >= datetime('now', '-7 days')
       GROUP BY date(created_at) ORDER BY day DESC`,
    ),
  ]);

  const stores = storesR.rows;
  return {
    generatedAt: new Date().toISOString(),
    stores,
    ordersLast7Days: Number(ordersR.rows[0]?.n) || 0,
    recentRotations: rotationsR.rows,
    salesHistory: dailyR.rows,
    totalCurrentRevenue: Math.round(stores.reduce((sum, s) => sum + (Number(s.current_revenue) || 0), 0) * 100) / 100,
  };
}

async function getLatestInsights(limit = 5) {
  const r = await client.execute({
    sql: 'SELECT id, type, content, created_at FROM ai_insights ORDER BY created_at DESC, id DESC LIMIT ?',
    args: [limit],
  });
  return r.rows;
}

module.exports = { generateInsight, getLatestInsights, isEnabled, MODEL };
