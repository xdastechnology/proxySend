const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { query } = require('../db');
const { requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();
router.use(requireUser);

// Get profile
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, phone, credits, wa_status, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// Update profile
router.put(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('phone')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^\+?[\d\s\-()]{7,20}$/)
      .withMessage('Invalid phone number'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, phone } = req.body;
      const userId = req.session.userId;

      // Check email uniqueness
      const { rows: emailRows } = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );
      if (emailRows.length) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      const normalizedPhone = phone ? normalizePhone(phone) : null;

      if (normalizedPhone) {
        const { rows: phoneRows } = await query(
          'SELECT id FROM users WHERE phone = $1 AND id != $2',
          [normalizedPhone, userId]
        );
        if (phoneRows.length) {
          return res.status(409).json({ error: 'Phone already in use' });
        }
      }

      await query(
        'UPDATE users SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [name, email, normalizedPhone, userId]
      );

      const { rows } = await query(
        'SELECT id, name, email, phone, credits, wa_status FROM users WHERE id = $1',
        [userId]
      );

      res.json({ user: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// Change password
router.put(
  '/password',
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('confirmPassword').custom((val, { req }) => {
      if (val !== req.body.newPassword) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.session.userId;

      const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password incorrect' });

      const newHash = await bcrypt.hash(newPassword, 12);
      await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newHash, userId]
      );

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
