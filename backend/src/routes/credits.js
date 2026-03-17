const express = require('express');
const { body } = require('express-validator');
const { query } = require('../db');
const { requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(requireUser);

// Get credits overview
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.userId;

    const { rows: userRows } = await query('SELECT credits FROM users WHERE id = $1', [userId]);

    const { rows: transactions } = await query(
      'SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );

    const { rows: requests } = await query(
      'SELECT * FROM credit_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    // Campaign usage summary
    const { rows: campaignUsage } = await query(
      `SELECT c.campaign_name, SUM(ABS(ct.amount)) as credits_used
       FROM credit_transactions ct
       JOIN campaigns c ON c.id = ct.campaign_id
       WHERE ct.user_id = $1 AND ct.type = 'campaign_send'
       GROUP BY ct.campaign_id, c.campaign_name
       ORDER BY credits_used DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      credits: userRows[0]?.credits || 0,
      transactions,
      requests,
      campaignUsage,
    });
  } catch (err) {
    next(err);
  }
});

// Submit credit request
router.post(
  '/request',
  [
    body('requestedCredits')
      .isInt({ min: 1, max: 100000 })
      .withMessage('Credits must be between 1 and 100,000'),
    body('note').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { requestedCredits, note } = req.body;
      const userId = req.session.userId;

      // Check for existing pending request
      const { rows: pendingRows } = await query(
        "SELECT id FROM credit_requests WHERE user_id = $1 AND status = 'pending'",
        [userId]
      );

      if (pendingRows.length) {
        return res.status(400).json({
          error: 'You already have a pending credit request. Please wait for it to be resolved.',
        });
      }

      // Get user reference code price
      const { rows: userRefRows } = await query(
        'SELECT rc.inr_per_message FROM users u JOIN reference_codes rc ON rc.id = u.reference_code_id WHERE u.id = $1',
        [userId]
      );
      const userRef = userRefRows[0];

      const { rows: insertRows } = await query(
        "INSERT INTO credit_requests (user_id, requested_credits, status, note, inr_per_message) VALUES ($1, $2, 'pending', $3, $4) RETURNING id",
        [userId, requestedCredits, note || null, userRef?.inr_per_message || null]
      );

      const { rows } = await query(
        'SELECT * FROM credit_requests WHERE id = $1',
        [insertRows[0].id]
      );
      res.status(201).json({ request: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
