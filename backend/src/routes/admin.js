const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query: queryParam } = require('express-validator');
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
      query("SELECT COUNT(*) as c FROM credit_requests WHERE status = 'pending' AND seller_id IS NULL"),
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
      `SELECT rc.*, s.name as seller_name,
              COUNT(DISTINCT u.id) as user_count
       FROM reference_codes rc
       LEFT JOIN sellers s ON s.id = rc.seller_id
       LEFT JOIN users u ON u.reference_code_id = rc.id
       GROUP BY rc.id, s.name
       ORDER BY rc.created_at DESC`
    );

    const { rows: pendingCreditRequests } = await query(
      `SELECT cr.*, u.name as user_name, u.email as user_email, u.credits as user_credits
       FROM credit_requests cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.status = 'pending' AND cr.seller_id IS NULL
       ORDER BY cr.created_at ASC`
    );

     const { rows: sellers } = await query(
      `SELECT s.id, s.name, s.email, s.phone, s.commission_pct, s.is_active, s.created_at,
            COUNT(u.id)::int as customer_count
       FROM sellers s
       LEFT JOIN users u ON u.seller_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
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
      sellers,
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
    body('sellerId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { code, inrPerMessage, marketingMessage, sellerId } = req.body;

      if (sellerId) {
        const { rows: sellerRows } = await query('SELECT id FROM sellers WHERE id = $1', [sellerId]);
        if (!sellerRows.length) {
          return res.status(404).json({ error: 'Seller not found' });
        }
      }

      const { rows: existing } = await query(
        'SELECT id FROM reference_codes WHERE code = $1',
        [code.toUpperCase()]
      );
      if (existing.length) return res.status(409).json({ error: 'Reference code already exists' });

      const { rows: insertRows } = await query(
        'INSERT INTO reference_codes (code, inr_per_message, marketing_message, is_active, seller_id) VALUES ($1, $2, $3, TRUE, $4) RETURNING id',
        [code.toUpperCase(), inrPerMessage, marketingMessage || null, sellerId || null]
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
        'SELECT * FROM credit_requests WHERE id = $1 AND seller_id IS NULL',
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
              u.is_active, u.seller_id,
              rc.code as reference_code, rc.inr_per_message,
              s.name as seller_name
       FROM users u
       LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
       LEFT JOIN sellers s ON s.id = u.seller_id
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
      WHERE cr.seller_id IS NULL
    `;
    const params = [];

    if (status) {
      sql += ' AND cr.status = $1';
      params.push(status);
    }

    sql += ' ORDER BY cr.created_at DESC LIMIT 100';

    const { rows: requests } = await query(sql, params);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

// Create seller
router.post(
  '/sellers',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('commissionPct')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Commission pct must be between 0 and 1'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, phone, password, commissionPct } = req.body;

      const { rows: existingRows } = await query('SELECT id FROM sellers WHERE email = $1', [email]);
      if (existingRows.length) {
        return res.status(409).json({ error: 'Seller email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const { rows: insertedRows } = await query(
        `INSERT INTO sellers (name, email, phone, password_hash, commission_pct, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, name, email, phone, commission_pct, is_active, created_at`,
        [name, email, phone || null, passwordHash, commissionPct]
      );

      res.status(201).json({ seller: insertedRows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// List sellers
router.get('/sellers', async (req, res, next) => {
  try {
    const { rows: sellers } = await query(
      `SELECT s.id, s.name, s.email, s.phone, s.commission_pct, s.is_active, s.created_at,
              COALESCE(uc.customer_count, 0)::int as customer_count,
              COALESCE(st.messages_sold, 0)::int as messages_sold,
              COALESCE(st.gross_sales, 0)::float as gross_sales,
              COALESCE(st.admin_commission, 0)::float as admin_commission,
              COALESCE(st.seller_net, 0)::float as seller_net
       FROM sellers s
       LEFT JOIN (
         SELECT seller_id, COUNT(*)::int as customer_count
         FROM users
         GROUP BY seller_id
       ) uc ON uc.seller_id = s.id
       LEFT JOIN (
         SELECT ct.seller_id,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN ct.amount ELSE 0 END), 0)::int as messages_sold,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN COALESCE(ct.gross_amount, ct.amount * COALESCE(rc.inr_per_message, 0)) ELSE 0 END), 0)::float as gross_sales,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN COALESCE(ct.admin_commission_amount, (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s2.commission_pct, 0))) ELSE 0 END), 0)::float as admin_commission,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN COALESCE(ct.seller_net_amount, (ct.amount * COALESCE(rc.inr_per_message, 0)) - (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s2.commission_pct, 0))) ELSE 0 END), 0)::float as seller_net
         FROM credit_transactions ct
         LEFT JOIN users u2 ON u2.id = ct.user_id
         LEFT JOIN reference_codes rc ON rc.id = u2.reference_code_id
         LEFT JOIN sellers s2 ON s2.id = ct.seller_id
         GROUP BY ct.seller_id
       ) st ON st.seller_id = s.id
       ORDER BY s.created_at DESC`
    );
    res.json({ sellers });
  } catch (err) {
    next(err);
  }
});

// Toggle seller active status (cascades deactivation to customers)
router.patch('/sellers/:id/toggle', async (req, res, next) => {
  try {
    const sellerId = req.params.id;
    const { rows } = await query('SELECT id, is_active FROM sellers WHERE id = $1', [sellerId]);
    const seller = rows[0];
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const nextActive = !seller.is_active;
    await query(
      'UPDATE sellers SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextActive, sellerId]
    );

    if (!nextActive) {
      await query(
        'UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $1',
        [sellerId]
      );
    }

    res.json({ success: true, isActive: nextActive });
  } catch (err) {
    next(err);
  }
});

// Update seller commission percentage
router.patch(
  '/sellers/:id/commission',
  [
    body('commissionPct')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Commission pct must be between 0 and 1'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { commissionPct } = req.body;
      const sellerId = req.params.id;

      const { rows } = await query(
        `UPDATE sellers
         SET commission_pct = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, email, phone, commission_pct, is_active, created_at`,
        [commissionPct, sellerId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      res.json({ seller: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// Seller financial report for admin
router.get('/reports/sellers', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id as seller_id, s.name as seller_name,
              COALESCE(st.messages_sold, 0)::int as messages_sold,
              COALESCE(st.gross_sales, 0)::float as gross_sales,
              COALESCE(st.admin_commission, 0)::float as admin_commission,
              COALESCE(st.seller_net, 0)::float as seller_net
       FROM sellers s
       LEFT JOIN (
         SELECT ct.seller_id,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN ct.amount ELSE 0 END), 0)::int as messages_sold,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN COALESCE(ct.gross_amount, ct.amount * COALESCE(rc.inr_per_message, 0)) ELSE 0 END), 0)::float as gross_sales,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN COALESCE(ct.admin_commission_amount, (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s2.commission_pct, 0))) ELSE 0 END), 0)::float as admin_commission,
                COALESCE(SUM(CASE WHEN ct.type IN ('credit_request_approved', 'seller_add') THEN COALESCE(ct.seller_net_amount, (ct.amount * COALESCE(rc.inr_per_message, 0)) - (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s2.commission_pct, 0))) ELSE 0 END), 0)::float as seller_net
         FROM credit_transactions ct
         LEFT JOIN users u2 ON u2.id = ct.user_id
         LEFT JOIN reference_codes rc ON rc.id = u2.reference_code_id
         LEFT JOIN sellers s2 ON s2.id = ct.seller_id
         GROUP BY ct.seller_id
       ) st ON st.seller_id = s.id
       ORDER BY gross_sales DESC, seller_name ASC`
    );

    res.json({ report: rows });
  } catch (err) {
    next(err);
  }
});

// Seller sales history for admin settlement management
router.get(
  '/seller-sales',
  [
    queryParam('status').optional().isIn(['pending', 'done']),
    queryParam('sellerId').optional().isInt({ min: 1 }).toInt(),
    queryParam('fromDate').optional().isISO8601().withMessage('fromDate must be YYYY-MM-DD'),
    queryParam('toDate').optional().isISO8601().withMessage('toDate must be YYYY-MM-DD'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { status, sellerId, fromDate, toDate } = req.query;

      if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        return res.status(400).json({ error: 'fromDate cannot be after toDate' });
      }

      const params = [];
      let where = "WHERE ct.seller_id IS NOT NULL AND ct.type IN ('credit_request_approved', 'seller_add')";

      if (sellerId) {
        params.push(sellerId);
        where += ` AND ct.seller_id = $${params.length}`;
      }

      if (status) {
        params.push(status);
        where += ` AND COALESCE(ct.settlement_status, 'pending') = $${params.length}`;
      }

      if (fromDate) {
        params.push(fromDate);
        where += ` AND ct.created_at >= $${params.length}::date`;
      }

      if (toDate) {
        params.push(toDate);
        where += ` AND ct.created_at < ($${params.length}::date + INTERVAL '1 day')`;
      }

      const { rows } = await query(
        `SELECT ct.id, ct.created_at, ct.type,
                s.id as seller_id, s.name as seller_name, s.email as seller_email,
                u.id as user_id, u.name as user_name, u.email as user_email,
                ct.amount as messages_sold,
                COALESCE(ct.gross_amount, ct.amount * COALESCE(rc.inr_per_message, 0))::float as gross_amount,
                COALESCE(ct.admin_commission_amount, (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s.commission_pct, 0)))::float as admin_commission_amount,
                COALESCE(ct.seller_net_amount, (ct.amount * COALESCE(rc.inr_per_message, 0)) - (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s.commission_pct, 0)))::float as seller_net_amount,
                COALESCE(ct.settlement_status, 'pending') as settlement_status,
                ct.settled_at,
                ct.settlement_note
         FROM credit_transactions ct
         LEFT JOIN sellers s ON s.id = ct.seller_id
         LEFT JOIN users u ON u.id = ct.user_id
         LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
         ${where}
         ORDER BY ct.created_at DESC
         LIMIT 500`,
        params
      );

      res.json({ sales: rows });
    } catch (err) {
      next(err);
    }
  }
);

// Mark seller sale settlement status as done/pending
router.patch(
  '/seller-sales/:id/settlement',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('action').isIn(['done', 'pending']).withMessage('Action must be done or pending'),
    body('adminNote').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const saleId = req.params.id;
      const { action, adminNote } = req.body;

      const { rows: existingRows } = await query(
        `SELECT id
         FROM credit_transactions
         WHERE id = $1
           AND seller_id IS NOT NULL
           AND type IN ('credit_request_approved', 'seller_add')`,
        [saleId]
      );

      if (!existingRows.length) {
        return res.status(404).json({ error: 'Sale record not found' });
      }

      const { rows } = await query(
        `UPDATE credit_transactions
         SET settlement_status = $1,
             settled_at = CASE WHEN $1 = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END,
             settlement_note = $2
         WHERE id = $3
         RETURNING id, settlement_status, settled_at, settlement_note`,
        [action, adminNote || null, saleId]
      );

      res.json({ sale: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
