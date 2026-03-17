const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query: queryParam } = require('express-validator');
const { query } = require('../db');
const { requireSeller } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone } = require('../utils/phone');
const sseService = require('../services/sse');

const router = express.Router();
router.use(requireSeller);

router.get(
  '/dashboard',
  [
    queryParam('fromDate').optional().isISO8601().withMessage('fromDate must be YYYY-MM-DD'),
    queryParam('toDate').optional().isISO8601().withMessage('toDate must be YYYY-MM-DD'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const { fromDate, toDate } = req.query;

      if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        return res.status(400).json({ error: 'fromDate cannot be after toDate' });
      }

      const salesParams = [sellerId];
      let salesWhere = "WHERE ct.seller_id = $1 AND ct.type IN ('credit_request_approved', 'seller_add')";

      if (fromDate) {
        salesParams.push(fromDate);
        salesWhere += ` AND ct.created_at >= $${salesParams.length}::date`;
      }

      if (toDate) {
        salesParams.push(toDate);
        salesWhere += ` AND ct.created_at < ($${salesParams.length}::date + INTERVAL '1 day')`;
      }

      const [customerCounts, pendingRequests, sales] = await Promise.all([
      query(
        `SELECT
            COUNT(*)::int as total_customers,
            SUM(CASE WHEN is_active THEN 1 ELSE 0 END)::int as active_customers
         FROM users
         WHERE seller_id = $1`,
        [sellerId]
      ),
      query(
        "SELECT COUNT(*)::int as pending_requests FROM credit_requests WHERE seller_id = $1 AND status = 'pending'",
        [sellerId]
      ),
      query(
        `SELECT
          COALESCE(SUM(ct.amount), 0)::int as messages_sold,
          COALESCE(SUM(COALESCE(ct.gross_amount, ct.amount * COALESCE(rc.inr_per_message, 0))), 0)::float as gross_sales,
          COALESCE(SUM(COALESCE(ct.admin_commission_amount, (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s.commission_pct, 0)))), 0)::float as admin_commission,
          COALESCE(SUM(COALESCE(ct.seller_net_amount, (ct.amount * COALESCE(rc.inr_per_message, 0)) - (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s.commission_pct, 0)))), 0)::float as seller_net
        FROM credit_transactions ct
        LEFT JOIN users u ON u.id = ct.user_id
        LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
        LEFT JOIN sellers s ON s.id = ct.seller_id
         ${salesWhere}`,
        salesParams
      ),
    ]);

      res.json({
        stats: {
          totalCustomers: customerCounts.rows[0]?.total_customers || 0,
          activeCustomers: customerCounts.rows[0]?.active_customers || 0,
          pendingRequests: pendingRequests.rows[0]?.pending_requests || 0,
          messagesSold: sales.rows[0]?.messages_sold || 0,
          grossSales: sales.rows[0]?.gross_sales || 0,
          adminCommission: sales.rows[0]?.admin_commission || 0,
          sellerNet: sales.rows[0]?.seller_net || 0,
        },
        period: {
          fromDate: fromDate || null,
          toDate: toDate || null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/customers',
  [
    queryParam('page').optional().isInt({ min: 1 }).toInt(),
    queryParam('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    queryParam('search').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const search = req.query.search || '';
      const offset = (page - 1) * limit;

      const params = [sellerId];
      let whereClause = 'WHERE u.seller_id = $1';

      if (search) {
        whereClause += ' AND (u.name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2)';
        params.push(`%${search}%`);
      }

      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int as count FROM users u ${whereClause}`,
        params
      );

      const { rows: customers } = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.credits, u.wa_status, u.is_active, u.created_at,
                rc.code as reference_code, rc.inr_per_message
         FROM users u
         LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      const total = countRows[0]?.count || 0;
      res.json({
        customers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/customers',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('referenceCode').trim().notEmpty().withMessage('Reference code is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const { name, email, phone, password, referenceCode } = req.body;

      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      const { rows: dupEmail } = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (dupEmail.length) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const { rows: dupPhone } = await query('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
      if (dupPhone.length) {
        return res.status(409).json({ error: 'Phone number already registered' });
      }

      const { rows: refRows } = await query(
        `SELECT id, seller_id
         FROM reference_codes
         WHERE code = $1 AND seller_id = $2 AND is_active = TRUE`,
        [String(referenceCode).toUpperCase(), sellerId]
      );
      const refCode = refRows[0];
      if (!refCode) {
        return res.status(400).json({ error: 'Invalid or inactive reference code for your seller account' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const { rows: createdRows } = await query(
        `INSERT INTO users (name, email, phone, password_hash, reference_code_id, seller_id, credits, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, 0, TRUE)
         RETURNING id`,
        [name, email, normalizedPhone, passwordHash, refCode.id, sellerId]
      );

      const { rows: customers } = await query(
        `SELECT id, name, email, phone, credits, wa_status, is_active, created_at
         FROM users WHERE id = $1`,
        [createdRows[0].id]
      );

      res.status(201).json({ customer: customers[0] });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/customers/:id/toggle',
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const customerId = req.params.id;

      const { rows } = await query(
        'SELECT id, is_active FROM users WHERE id = $1 AND seller_id = $2',
        [customerId, sellerId]
      );
      const customer = rows[0];
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const nextActive = !customer.is_active;
      await query(
        'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [nextActive, customerId]
      );

      res.json({ success: true, isActive: nextActive });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/customers/:id/credits',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('amount')
      .isInt({ min: 1, max: 1000000 })
      .withMessage('Amount must be between 1 and 1,000,000'),
    body('note').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const customerId = req.params.id;
      const { amount, note } = req.body;

      const { rows: customerRows } = await query(
        `SELECT u.id, u.name, u.credits,
                COALESCE(rc.inr_per_message, 0) as inr_per_message,
                COALESCE(s.commission_pct, 0) as commission_pct
         FROM users u
         LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
         LEFT JOIN sellers s ON s.id = u.seller_id
         WHERE u.id = $1 AND u.seller_id = $2`,
        [customerId, sellerId]
      );
      const customer = customerRows[0];

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      await query(
        'UPDATE users SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [amount, customerId]
      );

      const pricePerMessage = Number(customer.inr_per_message || 0);
      const commissionPct = Number(customer.commission_pct || 0);
      const grossAmount = Number((Number(amount) * pricePerMessage).toFixed(6));
      const adminCommissionAmount = Number((grossAmount * commissionPct).toFixed(6));
      const sellerNetAmount = Number((grossAmount - adminCommissionAmount).toFixed(6));

      await query(
        `INSERT INTO credit_transactions
          (user_id, amount, type, note, seller_id, price_per_message, gross_amount, admin_commission_amount, seller_net_amount)
         VALUES ($1, $2, 'seller_add', $3, $4, $5, $6, $7, $8)`,
        [
          customerId,
          amount,
          note || `Seller added ${amount} credits to customer #${customerId}`,
          sellerId,
          pricePerMessage,
          grossAmount,
          adminCommissionAmount,
          sellerNetAmount,
        ]
      );

      const { rows: updatedRows } = await query('SELECT credits FROM users WHERE id = $1', [customerId]);
      const newBalance = updatedRows[0]?.credits || customer.credits + amount;

      sseService.broadcastToUser(customerId, 'credits_update', { credits: newBalance });
      sseService.broadcastToAdmins('stats_update', {});

      res.json({ success: true, newBalance });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/sales-history',
  [
    queryParam('status').optional().isIn(['pending', 'done']),
    queryParam('fromDate').optional().isISO8601().withMessage('fromDate must be YYYY-MM-DD'),
    queryParam('toDate').optional().isISO8601().withMessage('toDate must be YYYY-MM-DD'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const { status, fromDate, toDate } = req.query;

      if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        return res.status(400).json({ error: 'fromDate cannot be after toDate' });
      }

      const params = [sellerId];
      let where = "WHERE ct.seller_id = $1 AND ct.type IN ('credit_request_approved', 'seller_add')";

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

      const { rows: sales } = await query(
        `SELECT ct.id, ct.created_at, ct.type,
                u.id as user_id, u.name as user_name, u.email as user_email,
                ct.amount as messages_sold,
                COALESCE(ct.gross_amount, ct.amount * COALESCE(rc.inr_per_message, 0))::float as gross_amount,
                COALESCE(ct.admin_commission_amount, (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s.commission_pct, 0)))::float as admin_commission_amount,
                COALESCE(ct.seller_net_amount, (ct.amount * COALESCE(rc.inr_per_message, 0)) - (ct.amount * COALESCE(rc.inr_per_message, 0) * COALESCE(s.commission_pct, 0)))::float as seller_net_amount,
                COALESCE(ct.settlement_status, 'pending') as settlement_status,
                ct.settled_at,
                ct.settlement_note
         FROM credit_transactions ct
         LEFT JOIN users u ON u.id = ct.user_id
         LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
         LEFT JOIN sellers s ON s.id = ct.seller_id
         ${where}
         ORDER BY ct.created_at DESC
         LIMIT 300`,
        params
      );

      res.json({ sales });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/reference-codes', async (req, res, next) => {
  try {
    const sellerId = req.session.sellerId;
    const { rows } = await query(
      `SELECT rc.*, COUNT(u.id)::int as customer_count
       FROM reference_codes rc
       LEFT JOIN users u ON u.reference_code_id = rc.id
       WHERE rc.seller_id = $1
       GROUP BY rc.id
       ORDER BY rc.created_at DESC`,
      [sellerId]
    );
    res.json({ referenceCodes: rows });
  } catch (err) {
    next(err);
  }
});

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
    body('inrPerMessage').isFloat({ min: 0 }).withMessage('INR per message must be non-negative'),
    body('marketingMessage').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const { code, inrPerMessage, marketingMessage } = req.body;

      const normalizedCode = String(code).toUpperCase();
      const { rows: existing } = await query('SELECT id FROM reference_codes WHERE code = $1', [normalizedCode]);
      if (existing.length) {
        return res.status(409).json({ error: 'Reference code already exists' });
      }

      const { rows: inserted } = await query(
        `INSERT INTO reference_codes (code, inr_per_message, marketing_message, is_active, seller_id)
         VALUES ($1, $2, $3, TRUE, $4)
         RETURNING *`,
        [normalizedCode, inrPerMessage, marketingMessage || null, sellerId]
      );

      res.status(201).json({ referenceCode: inserted[0] });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/reference-codes/:id/toggle', [param('id').isInt({ min: 1 }).toInt()], validate, async (req, res, next) => {
  try {
    const sellerId = req.session.sellerId;
    const refCodeId = req.params.id;

    const { rows } = await query(
      'SELECT id, is_active FROM reference_codes WHERE id = $1 AND seller_id = $2',
      [refCodeId, sellerId]
    );
    const code = rows[0];
    if (!code) {
      return res.status(404).json({ error: 'Reference code not found' });
    }

    const nextActive = !code.is_active;
    await query(
      'UPDATE reference_codes SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextActive, refCodeId]
    );

    res.json({ success: true, isActive: nextActive });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/credit-requests',
  [queryParam('status').optional().isIn(['pending', 'approved', 'rejected'])],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const { status } = req.query;
      const params = [sellerId];

      let sql = `
        SELECT cr.*, u.name as user_name, u.email as user_email, u.credits as user_credits
        FROM credit_requests cr
        JOIN users u ON u.id = cr.user_id
        WHERE cr.seller_id = $1
      `;

      if (status) {
        sql += ' AND cr.status = $2';
        params.push(status);
      }

      sql += ' ORDER BY cr.created_at DESC LIMIT 200';

      const { rows } = await query(sql, params);
      res.json({ requests: rows });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/credit-requests/:id',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
    body('approvedCredits').optional({ checkFalsy: true }).isInt({ min: 1, max: 1000000 }),
    body('sellerNote').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const sellerId = req.session.sellerId;
      const requestId = req.params.id;
      const { action, approvedCredits, sellerNote } = req.body;

      const { rows } = await query(
        `SELECT * FROM credit_requests
         WHERE id = $1 AND seller_id = $2`,
        [requestId, sellerId]
      );
      const request = rows[0];
      if (!request) {
        return res.status(404).json({ error: 'Credit request not found' });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({ error: 'Request already resolved' });
      }

      if (action === 'approve') {
        const creditsToAdd = approvedCredits || request.requested_credits;

        const { rows: sellerRows } = await query(
          'SELECT commission_pct FROM sellers WHERE id = $1',
          [sellerId]
        );
        const commissionPct = Number(sellerRows[0]?.commission_pct || 0);
        const pricePerMessage = Number(request.inr_per_message || 0);
        const grossAmount = Number((Number(creditsToAdd) * pricePerMessage).toFixed(6));
        const adminCommissionAmount = Number((grossAmount * commissionPct).toFixed(6));
        const sellerNetAmount = Number((grossAmount - adminCommissionAmount).toFixed(6));

        await query(
          'UPDATE users SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND seller_id = $3',
          [creditsToAdd, request.user_id, sellerId]
        );

        await query(
          `INSERT INTO credit_transactions
            (user_id, amount, type, note, seller_id, price_per_message, gross_amount, admin_commission_amount, seller_net_amount)
           VALUES ($1, $2, 'credit_request_approved', $3, $4, $5, $6, $7, $8)`,
          [
            request.user_id,
            creditsToAdd,
            `Seller approved credit request #${request.id}`,
            sellerId,
            pricePerMessage,
            grossAmount,
            adminCommissionAmount,
            sellerNetAmount,
          ]
        );

        await query(
          `UPDATE credit_requests SET
            status = 'approved',
            approved_credits = $1,
            admin_note = $2,
            resolved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [creditsToAdd, sellerNote || null, request.id]
        );

        const { rows: userRows } = await query('SELECT credits FROM users WHERE id = $1', [request.user_id]);
        sseService.broadcastToUser(request.user_id, 'credits_update', {
          credits: userRows[0]?.credits || 0,
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
          [sellerNote || null, request.id]
        );

        sseService.broadcastToUser(request.user_id, 'request_resolved', {
          requestId: request.id,
          status: 'rejected',
        });
      }

      const { rows: updatedRows } = await query('SELECT * FROM credit_requests WHERE id = $1', [request.id]);
      res.json({ request: updatedRows[0] });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
