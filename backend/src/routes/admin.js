const express = require('express');
const { body, query: queryParam } = require('express-validator');
const { query } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const sseService = require('../services/sse');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireAdmin);

// Dashboard stats
router.get('/dashboard', async (req, res, next) => {
  try {
    const [r1, r2, r3, r4] = await Promise.all([
      query('SELECT COUNT(*) as c FROM users'),
      query("SELECT COUNT(*) as c FROM message_logs WHERE status = 'sent'"),
      query('SELECT COUNT(*) as c FROM credit_transactions'),
      query("SELECT COUNT(*) as c FROM credit_requests WHERE status = 'pending'"),
    ]);

    const { rows: users } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.credits, u.wa_status, u.created_at,
              rc.code as reference_code
       FROM users u
       LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
       ORDER BY u.created_at DESC
       LIMIT 50`
    );

    const { rows: recentTransactions } = await query(
      `SELECT ct.*, u.name as user_name, u.email as user_email
       FROM credit_transactions ct
       JOIN users u ON u.id = ct.user_id
       ORDER BY ct.created_at DESC
       LIMIT 20`
    );

    const { rows: referenceCodes } = await query(
      `SELECT rc.*,
              COUNT(DISTINCT u.id) as user_count
       FROM reference_codes rc
       LEFT JOIN users u ON u.reference_code_id = rc.id
       GROUP BY rc.id
       ORDER BY rc.created_at DESC`
    );

    const { rows: pendingCreditRequests } = await query(
      `SELECT cr.*, u.name as user_name, u.email as user_email, u.credits as user_credits
       FROM credit_requests cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.status = 'pending'
       ORDER BY cr.created_at ASC`
    );

    res.json({
      stats: {
        totalUsers: parseInt(r1.rows[0].c),
        totalMessages: parseInt(r2.rows[0].c),
        totalTransactions: parseInt(r3.rows[0].c),
        pendingRequests: parseInt(r4.rows[0].c),
      },
      users,
      recentTransactions,
      referenceCodes,
      pendingCreditRequests,
    });
  } catch (err) {
    next(err);
  }
});

// Add credits to user
router.post(
  '/credits/add',
  [
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('amount')
      .isInt({ min: 1, max: 1000000 })
      .withMessage('Amount must be between 1 and 1,000,000'),
    body('note').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, amount, note } = req.body;

      const { rows: userRows } = await query('SELECT id, credits FROM users WHERE email = $1', [email]);
      const user = userRows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      await query(
        'UPDATE users SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [amount, user.id]
      );

      await query(
        "INSERT INTO credit_transactions (user_id, amount, type, note) VALUES ($1, $2, 'admin_add', $3)",
        [user.id, amount, note || `Admin added ${amount} credits`]
      );

      const { rows: updatedRows } = await query('SELECT credits FROM users WHERE id = $1', [user.id]);

      // Broadcast update to user
      sseService.broadcastToUser(user.id, 'credits_update', { credits: updatedRows[0].credits });
      sseService.broadcastToAdmins('stats_update', {});

      res.json({ success: true, newBalance: updatedRows[0].credits });
    } catch (err) {
      next(err);
    }
  }
);

// Create reference code
router.post(
  '/reference-codes',
  [
    body('code')
      .trim()
      .notEmpty()
      .withMessage('Code is required')
      .isLength({ min: 3, max: 20 })
      .withMessage('Code must be 3-20 chars')
      .matches(/^[A-Z0-9_]+$/i)
      .withMessage('Code must be alphanumeric'),
    body('inrPerMessage')
      .isFloat({ min: 0 })
      .withMessage('INR per message must be non-negative'),
    body('marketingMessage').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { code, inrPerMessage, marketingMessage } = req.body;

      const { rows: existing } = await query(
        'SELECT id FROM reference_codes WHERE code = $1',
        [code.toUpperCase()]
      );
      if (existing.length) return res.status(409).json({ error: 'Reference code already exists' });

      const { rows: insertRows } = await query(
        'INSERT INTO reference_codes (code, inr_per_message, marketing_message, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id',
        [code.toUpperCase(), inrPerMessage, marketingMessage || null]
      );

      const { rows } = await query(
        'SELECT * FROM reference_codes WHERE id = $1',
        [insertRows[0].id]
      );
      res.status(201).json({ referenceCode: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// Toggle reference code active status
router.patch('/reference-codes/:id/toggle', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM reference_codes WHERE id = $1', [req.params.id]);
    const refCode = rows[0];
    if (!refCode) return res.status(404).json({ error: 'Reference code not found' });

    const newStatus = !refCode.is_active;
    await query(
      'UPDATE reference_codes SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStatus, req.params.id]
    );

    res.json({ success: true, isActive: newStatus });
  } catch (err) {
    next(err);
  }
});

// Approve/Reject credit request
router.patch(
  '/credit-requests/:id',
  [
    body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
    body('approvedCredits')
      .optional({ checkFalsy: true })
      .isInt({ min: 1, max: 1000000 })
      .withMessage('Invalid credit amount'),
    body('adminNote').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { action, approvedCredits, adminNote } = req.body;

      const { rows: requestRows } = await query(
        'SELECT * FROM credit_requests WHERE id = $1',
        [req.params.id]
      );
      const request = requestRows[0];

      if (!request) return res.status(404).json({ error: 'Credit request not found' });
      if (request.status !== 'pending') {
        return res.status(400).json({ error: 'Request already resolved' });
      }

      if (action === 'approve') {
        const creditsToAdd = approvedCredits || request.requested_credits;

        // Add credits to user
        await query(
          'UPDATE users SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [creditsToAdd, request.user_id]
        );

        // Write transaction
        await query(
          "INSERT INTO credit_transactions (user_id, amount, type, note) VALUES ($1, $2, 'credit_request_approved', $3)",
          [request.user_id, creditsToAdd, `Credit request #${request.id} approved`]
        );

        // Update request
        await query(
          `UPDATE credit_requests SET
            status = 'approved',
            approved_credits = $1,
            admin_note = $2,
            resolved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [creditsToAdd, adminNote || null, request.id]
        );

        // Broadcast to user
        const { rows: updatedUserRows } = await query('SELECT credits FROM users WHERE id = $1', [request.user_id]);
        sseService.broadcastToUser(request.user_id, 'credits_update', {
          credits: updatedUserRows[0].credits,
        });
        sseService.broadcastToUser(request.user_id, 'request_resolved', {
          requestId: request.id,
          status: 'approved',
          creditsAdded: creditsToAdd,
        });
      } else {
        await query(
          `UPDATE credit_requests SET
            status = 'rejected',
            admin_note = $1,
            resolved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [adminNote || null, request.id]
        );

        sseService.broadcastToUser(request.user_id, 'request_resolved', {
          requestId: request.id,
          status: 'rejected',
        });
      }

      sseService.broadcastToAdmins('stats_update', {});

      const { rows: updatedRows } = await query('SELECT * FROM credit_requests WHERE id = $1', [request.id]);
      res.json({ request: updatedRows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// List all users
router.get('/users', async (req, res, next) => {
  try {
    const { rows: users } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.credits, u.wa_status, u.created_at,
              rc.code as reference_code, rc.inr_per_message
       FROM users u
       LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
       ORDER BY u.created_at DESC`
    );
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// Get all credit requests
router.get('/credit-requests', async (req, res, next) => {
  try {
    const { status } = req.query;

    let sql = `
      SELECT cr.*, u.name as user_name, u.email as user_email, u.credits as user_credits
      FROM credit_requests cr
      JOIN users u ON u.id = cr.user_id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE cr.status = $1';
      params.push(status);
    }

    sql += ' ORDER BY cr.created_at DESC LIMIT 100';

    const { rows: requests } = await query(sql, params);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
