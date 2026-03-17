const { query } = require('../db');

async function requireUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { rows } = await query('SELECT id, is_active FROM users WHERE id = $1', [req.session.userId]);
    const user = rows[0];

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your seller.' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

async function requireSeller(req, res, next) {
  if (!req.session || !req.session.sellerId) {
    return res.status(401).json({ error: 'Seller authentication required' });
  }

  try {
    const { rows } = await query('SELECT id, is_active FROM sellers WHERE id = $1', [req.session.sellerId]);
    const seller = rows[0];

    if (!seller) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Seller not found' });
    }

    if (!seller.is_active) {
      return res.status(403).json({ error: 'Seller account is deactivated' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  next();
}

module.exports = { requireUser, requireSeller, requireAdmin };
