require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const logger = require('./config/logger');
const { initializeDatabase } = require('./config/database');
const TursoSessionStore = require('./config/tursoSessionStore');

// Route imports
const authRoutes = require('./routes/authRoutes');
const contactRoutes = require('./routes/contactRoutes');
const templateRoutes = require('./routes/templateRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const adminRoutes = require('./routes/adminRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const creditRoutes = require('./routes/creditRoutes');
const realtimeRoutes = require('./routes/realtimeRoutes');
const { normalizeStaleRunningCampaigns } = require('./services/campaignService');

const app = express();

function validateEnvironment() {
  const required = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
    'SESSION_SECRET',
    'ADMIN_PASSWORD',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

validateEnvironment();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'cdnjs.cloudflare.com'],
      },
    },
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(
  session({
    store: new TursoSessionStore({ tableName: 'app_sessions' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global template variables middleware
app.use((req, res, next) => {
  // Refresh user credits from session on every request
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

// Routes
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/contacts', contactRoutes);
app.use('/templates', templateRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/credits', creditRoutes);
app.use('/whatsapp', whatsappRoutes);
app.use('/admin', adminRoutes);
app.use('/realtime', realtimeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Page Not Found',
    message: 'The page you are looking for does not exist.',
    code: 404,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).render('error', {
    title: '500 - Server Error',
    message: 'An internal server error occurred.',
    code: 500,
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initializeDatabase();
  await normalizeStaleRunningCampaigns();
  app.listen(PORT, () => {
    logger.info(`ProxySend running on http://localhost:${PORT}`);
    logger.info(`Admin panel: http://localhost:${PORT}/admin/login`);
  });
}

startServer().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});

module.exports = app;