require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);
const logger = require('./config/logger');
const { initializeDatabase } = require('./config/database');

// Route imports
const authRoutes = require('./routes/authRoutes');
const contactRoutes = require('./routes/contactRoutes');
const templateRoutes = require('./routes/templateRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const adminRoutes = require('./routes/adminRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const creditRoutes = require('./routes/creditRoutes');

const app = express();

// Initialize database
initializeDatabase();

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

// Ensure data directory exists for sessions store
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Session configuration
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
    secret: process.env.SESSION_SECRET || 'fallback_secret_change_this',
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
app.listen(PORT, () => {
  logger.info(`ProxySend running on http://localhost:${PORT}`);
  logger.info(`Admin panel: http://localhost:${PORT}/admin/login`);
});

module.exports = app;