const logger = require('../config/logger');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  logger.warn(`Unauthorized access attempt to ${req.path}`);
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login?error=Please login to continue');
}

function requireGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { requireAuth, requireGuest };