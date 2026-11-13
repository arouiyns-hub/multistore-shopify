require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');

const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const aiService = require('./services/aiService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.set('wss', wss);

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api', limiter);

// Body parsing (webhooks need raw body for HMAC)
app.use('/webhooks', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);

// Ping health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// WebSocket connection log
wss.on('connection', (ws) => {
  console.log('[WS] Client connecté');
  ws.on('close', () => console.log('[WS] Client déconnecté'));
});

// Cron : insight IA quotidien à 8h
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
server.listen(PORT, () => {
  console.log(`\n🚀 MultiStore Backend démarré sur http://localhost:${PORT}`);
  console.log(`📡 WebSocket actif`);
  console.log(`📋 Panel API : http://localhost:${PORT}/api/stats\n`);
});
