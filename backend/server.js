require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');

const { initDb, state: dbState, describeTarget } = require('./db/database');
const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const storeManager = require('./services/storeManager');
const aiService = require('./services/aiService');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, cb) {
    cb(null, !origin || allowedOrigins.includes(origin));
  },
}));

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));

app.use('/webhooks', express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.status(dbState.ready ? 200 : 503).json({
    status: dbState.ready ? 'ok' : 'db_unavailable',
    db: dbState.ready ? 'connected' : dbState.error || 'connecting',
    ai: aiService.isEnabled() ? 'enabled' : 'disabled',
    adminKey: Boolean(process.env.ADMIN_API_KEY),
    uptime: Math.round(process.uptime()),
  });
});

// Lien public à mettre dans les pubs / bio : redirige vers la boutique active.
// /go/products/xyz?utm=... → https://<boutique active>/products/xyz?utm=...
const redirectPage = (msg) =>
  `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Boutique indisponible</title><body style="font-family:system-ui;background:#0b0b10;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><p>${msg}</p></body></html>`;

app.get(/^\/go(\/.*)?$/, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!dbState.ready) return res.status(503).type('html').send(redirectPage('Boutique momentanément indisponible, réessaie dans un instant.'));
  try {
    const active = await storeManager.getActiveStore();
    if (!active) return res.status(503).type('html').send(redirectPage('Aucune boutique disponible pour le moment.'));
    const rest = req.params[0] || '/';
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const path = rest.startsWith('//') ? '/' : rest;
    res.redirect(302, `https://${active.shopify_domain}${path}${query}`);
  } catch (err) {
    console.error('[GO]', err);
    res.status(503).type('html').send(redirectPage('Boutique momentanément indisponible, réessaie dans un instant.'));
  }
});

app.get('/', (req, res) => res.json({ name: 'MultiStore backend', health: '/health', redirect: '/go' }));

// WebSocket temps réel, réservé au panel (clé admin passée en ?key=)
const wss = new WebSocketServer({
  server,
  verifyClient(info, done) {
    try {
      const key = new URL(info.req.url, 'http://x').searchParams.get('key');
      if (!apiRoutes.isValidKey(key)) return done(false, 401, 'Unauthorized');
      done(true);
    } catch {
      done(false, 400, 'Bad Request');
    }
  },
});
app.set('wss', wss);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('error', () => {});
});

// Ping toutes les 30 s pour que le proxy Railway ne coupe pas les connexions inactives
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

cron.schedule('0 8 * * *', async () => {
  if (!aiService.isEnabled() || !dbState.ready) return;
  try {
    await aiService.generateInsight('daily_summary');
    console.log('[CRON] Insight quotidien généré');
  } catch (err) {
    console.error('[CRON] Erreur insight:', err.message);
  }
}, { timezone: process.env.TZ_CRON || 'Europe/Paris' });

async function connectDb(attempt = 1) {
  try {
    await initDb();
    await storeManager.ensureActiveStore();
    dbState.ready = true;
    dbState.error = null;
    console.log(`[DB] Connectée (${describeTarget()})`);
  } catch (err) {
    dbState.ready = false;
    const cause = err.cause ? ` | cause: ${err.cause.code || err.cause.message}` : '';
    dbState.error = `${err.message}${cause}`;
    const delay = Math.min(30000, 2000 * attempt);
    console.error(`[DB] Connexion impossible à ${describeTarget()} : ${dbState.error} — nouvel essai dans ${delay / 1000}s`);
    setTimeout(() => connectDb(attempt + 1), delay);
  }
}

const PORT = Number(process.env.PORT) || 3001;

if (!process.env.ADMIN_API_KEY) console.warn('[CONFIG] ADMIN_API_KEY absente : le panel restera bloqué tant qu’elle n’est pas définie');
if (!aiService.isEnabled()) console.warn('[CONFIG] ANTHROPIC_API_KEY absente : assistant IA désactivé');

server.listen(PORT, () => {
  console.log(`[HTTP] MultiStore backend sur le port ${PORT} — CORS: ${allowedOrigins.join(', ')}`);
  connectDb();
});

function shutdown() {
  clearInterval(heartbeat);
  wss.clients.forEach((ws) => ws.terminate());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
