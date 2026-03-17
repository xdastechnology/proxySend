const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  sessionSecret: process.env.SESSION_SECRET || 'proxysend-dev-secret-change-in-prod',
  adminPassword: process.env.ADMIN_PASSWORD,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/proxysend',
  uploadsDir: process.env.UPLOADS_DIR || require('path').resolve(__dirname, '../../uploads'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  logLevel: process.env.LOG_LEVEL || 'info',
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '25', 10),
};

module.exports = config;
