require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const pgSession = require('connect-pg-simple')(session);

const path = require('path');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { initDb, getPool } = require('./src/db');
const { runMigrations } = require('./src/db/migrations');
const errorHandler = require('./src/middleware/errorHandler');
const { normalizeStaleCampaigns } = require('./src/services/campaign');

const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

// Routes
const authRoutes = require('./src/routes/auth');
const profileRoutes = require('./src/routes/profile');
const whatsappRoutes = require('./src/routes/whatsapp');
const contactsRoutes = require('./src/routes/contacts');
const templatesRoutes = require('./src/routes/templates');
const campaignsRoutes = require('./src/routes/campaigns');
const creditsRoutes = require('./src/routes/credits');
const sseRoutes = require('./src/routes/sse');
const adminRoutes = require('./src/routes/admin');
const sellerRoutes = require('./src/routes/seller');

async function startServer() {
  // Validate required env
  if (!process.env.SESSION_SECRET) {
    logger.warn('SESSION_SECRET not set - using insecure default (set in production!)');
  }
  if (!process.env.ADMIN_PASSWORD) {
    logger.error('ADMIN_PASSWORD is required');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is required');
    process.exit(1);
  }

  // Init DB pool and run migrations
  initDb();
  await runMigrations();

  const app = express();

  // Trust proxy for rate limiting behind nginx etc
  app.set('trust proxy', 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Session store (PostgreSQL)
  const sessionStore = new pgSession({
    pool: getPool(),
    tableName: 'app_sessions',
    createTableIfMissing: true,
  });

  app.use(
    session({
      store: sessionStore,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: 'proxysend.sid',
      cookie: {
        secure: config.nodeEnv === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax',
      },
    })
  );


  // Static uploads
  app.use('/uploads', express.static(config.uploadsDir));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/templates', templatesRoutes);
  app.use('/api/campaigns', campaignsRoutes);
  app.use('/api/credits', creditsRoutes);
  app.use('/api/sse', sseRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/seller', sellerRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Legacy service worker cleanup endpoint.
  // If users still have an older Workbox SW registered at /sw.js,
  // this script will replace it and immediately unregister itself.
  app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(`
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    } catch (e) {
      // no-op
    }
  })());
});
    `);
  });

  // Serve frontend static files (built with `npm run build` in /frontend)
  app.use(express.static(FRONTEND_DIST));

  // Error handler (must come before SPA fallback)
  app.use(errorHandler);

  // SPA fallback — send index.html for any non-API route so React Router works
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });

  // Normalize stale running campaigns on startup
  try {
    await normalizeStaleCampaigns();
    logger.info('Stale campaigns normalized');
  } catch (err) {
    logger.error({ err }, 'Failed to normalize stale campaigns');
  }

  const PORT = config.port;
  const httpServer = app.listen(PORT, () => {
    logger.info(`Proxy Send backend running on port ${PORT} [${config.nodeEnv}]`);
  });

  httpServer.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      logger.error(
        { port: PORT },
        `Port ${PORT} is already in use. Stop the existing backend process or run with a different PORT.`
      );
      process.exit(1);
      return;
    }

    logger.error({ err }, 'HTTP server failed to start');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await getPool().end();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
