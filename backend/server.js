require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');

const { initDb } = require('./db/database');
const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const aiService = require('./services/aiService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.set('wss', wss);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api', limiter);

app.use('/webhooks', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

wss.on('connection', (ws) => {
  console.log('[WS] Client connecté');
  ws.on('close', () => console.log('[WS] Client déconnecté'));
});

cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Génération insight quotidien...');
  try {
    await aiService.generateInsight('daily_summary');
    console.log('[CRON] Insight généré');
  } catch (err) {
    console.error('[CRON] Erreur insight:', err.message);
  }
});

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await initDb();
    console.log('[DB] Tables initialisées (Turso)');
    server.listen(PORT, () => {
      console.log(`\n🚀 MultiStore Backend démarré sur http://localhost:${PORT}`);
      console.log(`📡 WebSocket actif`);
      console.log(`📋 Panel API : http://localhost:${PORT}/api/stats\n`);
    });
  } catch (err) {
    console.error('[DB] Erreur initialisation:', err.message);
    process.exit(1);
  }
}

start();
