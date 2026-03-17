const express = require('express');
const { body, query: queryParam } = require('express-validator');
const { query } = require('../db');
const { requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { runCampaign } = require('../services/campaign');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireUser);

// List campaigns
router.get(
  '/',
  [
    queryParam('page').optional().isInt({ min: 1 }).toInt(),
    queryParam('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const offset = (page - 1) * limit;

      const { rows: countRows } = await query(
        'SELECT COUNT(*) as count FROM campaigns WHERE user_id = $1',
        [userId]
      );
      const total = parseInt(countRows[0].count);

      const { rows: campaigns } = await query(
        'SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      res.json({
        campaigns,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get campaign detail with contacts
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.session.userId;

    const { rows: campaignRows } = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    const campaign = campaignRows[0];

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    let template = null;
    if (campaign.template_id) {
      const { rows: templateRows } = await query(
        'SELECT * FROM templates WHERE id = $1',
        [campaign.template_id]
      );
      template = templateRows[0] || null;
    }

    const { rows: contacts } = await query(
      `SELECT cc.id, cc.status, cc.error_note, cc.sent_at, cc.contact_id,
              c.name, c.phone, c.email
       FROM campaign_contacts cc
       JOIN contacts c ON c.id = cc.contact_id
       WHERE cc.campaign_id = $1
       ORDER BY cc.id ASC`,
      [req.params.id]
    );

    res.json({
      campaign,
      template: template
        ? { ...template, buttons: template.buttons ? JSON.parse(template.buttons) : [] }
        : null,
      contacts,
    });
  } catch (err) {
    next(err);
  }
});

// Create campaign
router.post(
  '/',
  [
    body('campaignName').trim().notEmpty().withMessage('Campaign name is required').isLength({ max: 150 }),
    body('templateId').isInt({ min: 1 }).withMessage('Template is required'),
    body('contactIds')
      .isArray({ min: 1 })
      .withMessage('At least one contact is required'),
    body('contactIds.*').isInt({ min: 1 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { campaignName, templateId, contactIds } = req.body;
      const userId = req.session.userId;

      // Verify template belongs to user
      const { rows: templateRows } = await query(
        'SELECT id FROM templates WHERE id = $1 AND user_id = $2',
        [templateId, userId]
      );
      if (!templateRows.length) return res.status(404).json({ error: 'Template not found' });

      // Verify contacts belong to user using ANY
      const { rows: contacts } = await query(
        'SELECT id FROM contacts WHERE id = ANY($1::int[]) AND user_id = $2',
        [contactIds, userId]
      );

      if (contacts.length === 0) {
        return res.status(400).json({ error: 'No valid contacts found' });
      }

      // Create campaign
      const { rows: campaignRows } = await query(
        "INSERT INTO campaigns (user_id, template_id, campaign_name, status, total_contacts) VALUES ($1, $2, $3, 'pending', $4) RETURNING id",
        [userId, templateId, campaignName, contacts.length]
      );
      const campaignId = campaignRows[0].id;

      // Add campaign contacts in bulk
      const values = contacts.map((c, i) => `($1, $${i + 2}, 'pending')`).join(', ');
      await query(
        `INSERT INTO campaign_contacts (campaign_id, contact_id, status) VALUES ${values}`,
        [campaignId, ...contacts.map((c) => c.id)]
      );

      const { rows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
      res.status(201).json({ campaign: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// Start campaign
router.post('/:id/start', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const campaignId = parseInt(req.params.id, 10);

    const { rows } = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );
    const campaign = rows[0];

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Campaign already running' });
    }

    if (campaign.status === 'completed') {
      return res.status(400).json({ error: 'Campaign already completed' });
    }

    // Start async (non-blocking)
    setImmediate(() => {
      runCampaign(campaignId, userId).catch((err) => {
        logger.error({ err, campaignId }, 'Campaign run error');
      });
    });

    res.json({ success: true, message: 'Campaign started' });
  } catch (err) {
    next(err);
  }
});

// Delete campaign
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.userId;

    const { rows } = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    const campaign = rows[0];

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Cannot delete a running campaign' });
    }

    await query('DELETE FROM campaigns WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
