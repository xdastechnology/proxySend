const logger = require('../config/logger');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  logger.warn(`Unauthorized admin access attempt to ${req.path}`);
  return res.redirect('/admin/login');
}

module.exports = { requireAdmin };