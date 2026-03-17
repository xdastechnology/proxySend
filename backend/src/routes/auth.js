const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { query } = require('../db');
const { validate } = require('../middleware/validate');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// Register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone is required')
      .matches(/^\+?[\d\s\-()]{7,20}$/)
      .withMessage('Invalid phone number'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('confirmPassword').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
    body('referenceCode').trim().notEmpty().withMessage('Reference code is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, phone, password, referenceCode } = req.body;

      // Check reference code
      const { rows: refRows } = await query(
        `SELECT rc.*, s.id as seller_id
         FROM reference_codes rc
         JOIN sellers s ON s.id = rc.seller_id
         WHERE rc.code = $1 AND rc.is_active = TRUE AND s.is_active = TRUE`,
        [referenceCode.toUpperCase()]
      );
      const refCode = refRows[0];

      if (!refCode) {
        return res.status(400).json({ error: 'Invalid or inactive seller reference code' });
      }

      // Check duplicate email
      const { rows: emailRows } = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (emailRows.length) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Normalize and check phone
      const { normalizePhone } = require('../utils/phone');
      const normalizedPhone = normalizePhone(phone);

      if (normalizedPhone) {
        const { rows: phoneRows } = await query('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
        if (phoneRows.length) {
          return res.status(409).json({ error: 'Phone number already registered' });
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const { rows: insertRows } = await query(
        'INSERT INTO users (name, email, phone, password_hash, reference_code_id, seller_id, credits, is_active) VALUES ($1, $2, $3, $4, $5, $6, 0, TRUE) RETURNING id',
        [name, email, normalizedPhone, passwordHash, refCode.id, refCode.seller_id]
      );
      const userId = insertRows[0].id;

      const { rows: userRows } = await query(
        'SELECT id, name, email, phone, credits, wa_status, seller_id, is_active FROM users WHERE id = $1',
        [userId]
      );
      const user = userRows[0];

      logger.info({ userId: user.id, email }, 'User registered');

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return next(err);
        res.status(201).json({ user });
      });
    } catch (err) {
      next(err);
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('identifier').trim().notEmpty().withMessage('Email or phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { identifier, password } = req.body;

      // Find by email or phone
      const { rows } = await query(
        'SELECT * FROM users WHERE email = $1 OR phone = $1',
        [identifier]
      );
      const user = rows[0];

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is deactivated. Contact your seller.' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.userId = user.id;
      req.session.sellerId = null;
      req.session.isAdmin = false;
      req.session.save((err) => {
        if (err) return next(err);
        res.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            credits: user.credits,
            wa_status: user.wa_status,
            seller_id: user.seller_id,
            is_active: user.is_active,
          },
        });
      });

      logger.info({ userId: user.id }, 'User logged in');
    } catch (err) {
      next(err);
    }
  }
);

// Admin login
router.post(
  '/admin/login',
  [body('password').notEmpty().withMessage('Password is required')],
  validate,
  (req, res) => {
    const { password } = req.body;
    if (password !== config.adminPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    req.session.userId = null;
    req.session.sellerId = null;
    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      res.json({ success: true });
    });
  }
);

// Seller login
router.post(
  '/seller/login',
  [
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const { rows } = await query('SELECT * FROM sellers WHERE email = $1', [email]);
      const seller = rows[0];

      if (!seller) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!seller.is_active) {
        return res.status(403).json({ error: 'Seller account is deactivated' });
      }

      const valid = await bcrypt.compare(password, seller.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.userId = null;
      req.session.isAdmin = false;
      req.session.sellerId = seller.id;
      req.session.save((err) => {
        if (err) return next(err);
        res.json({
          seller: {
            id: seller.id,
            name: seller.name,
            email: seller.email,
            phone: seller.phone,
            commission_pct: seller.commission_pct,
            is_active: seller.is_active,
          },
        });
      });

      logger.info({ sellerId: seller.id }, 'Seller logged in');
    } catch (err) {
      next(err);
    }
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('proxysend.sid');
    res.json({ success: true });
  });
});

// Get current session
router.get('/me', async (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const { rows } = await query(
      'SELECT id, name, email, phone, credits, wa_status, created_at, seller_id, is_active FROM users WHERE id = $1',
      [req.session.userId]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// Seller me
router.get('/seller/me', async (req, res, next) => {
  if (!req.session?.sellerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const { rows } = await query(
      'SELECT id, name, email, phone, commission_pct, is_active, created_at FROM sellers WHERE id = $1',
      [req.session.sellerId]
    );
    const seller = rows[0];
    if (!seller) {
      return res.status(401).json({ error: 'Seller not found' });
    }
    if (!seller.is_active) {
      return res.status(403).json({ error: 'Seller account is deactivated' });
    }
    res.json({ seller });
  } catch (err) {
    next(err);
  }
});

// Admin me
router.get('/admin/me', (req, res) => {
  if (!req.session?.isAdmin) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ isAdmin: true });
});

module.exports = router;
