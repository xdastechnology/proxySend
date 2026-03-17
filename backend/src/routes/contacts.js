const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, query: queryParam } = require('express-validator');
const { query } = require('../db');
const { requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const { parseContactsCSV, generateContactsCSV } = require('../utils/csv');
const waService = require('../services/whatsapp');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireUser);

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files allowed'));
    }
  },
});

// List contacts with pagination and search
router.get(
  '/',
  [
    queryParam('page').optional().isInt({ min: 1 }).toInt(),
    queryParam('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    queryParam('search').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const search = req.query.search || '';
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE user_id = $1';
      const params = [userId];

      if (search) {
        whereClause += ' AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)';
        params.push(`%${search}%`);
      }

      const { rows: countRows } = await query(
        `SELECT COUNT(*) as count FROM contacts ${whereClause}`,
        params
      );
      const total = parseInt(countRows[0].count);

      const { rows: contacts } = await query(
        `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      res.json({
        contacts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Search contacts (live)
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim().length < 1) {
      return res.json({ contacts: [] });
    }
    const search = `%${String(q).trim()}%`;
    const { rows: contacts } = await query(
      'SELECT * FROM contacts WHERE user_id = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2) ORDER BY name ASC LIMIT 50',
      [req.session.userId, search]
    );
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

// Lightweight list for pickers/modals (avoids expensive count query)
router.get(
  '/picker',
  [
    queryParam('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
    queryParam('search').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const limit = req.query.limit || 200;
      const search = req.query.search || '';

      const params = [userId];
      let whereClause = 'WHERE user_id = $1';

      if (search) {
        whereClause += ' AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)';
        params.push(`%${search}%`);
      }

      const { rows: contacts } = await query(
        `SELECT id, name, phone, email, gender FROM contacts ${whereClause} ORDER BY id DESC LIMIT $${params.length + 1}`,
        [...params, limit]
      );

      res.json({ contacts });
    } catch (err) {
      next(err);
    }
  }
);

// Get single contact
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    const contact = rows[0];
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
});

// Create contact
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Invalid email'),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other', 'unspecified'])
      .withMessage('Invalid gender'),
    body('validateWhatsApp').optional().isBoolean(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, phone, email, gender = 'unspecified', validateWhatsApp } = req.body;
      const userId = req.session.userId;

      const normalized = normalizePhone(phone);
      if (!normalized || !isValidPhone(normalized)) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      // Check duplicate
      const { rows: dupRows } = await query(
        'SELECT id FROM contacts WHERE user_id = $1 AND phone = $2',
        [userId, normalized]
      );
      if (dupRows.length) {
        return res.status(409).json({ error: 'Contact with this phone already exists' });
      }

      // Validate WhatsApp
      if (validateWhatsApp) {
        try {
          const exists = await waService.checkNumberOnWhatsApp(userId, normalized);
          if (!exists) {
            return res.status(400).json({ error: 'Number not found on WhatsApp' });
          }
        } catch {
          return res.status(400).json({ error: 'WhatsApp not connected - cannot validate number' });
        }
      }

      const { rows: insertRows } = await query(
        'INSERT INTO contacts (user_id, name, phone, email, gender) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, name, normalized, email || null, gender]
      );

      const { rows } = await query('SELECT * FROM contacts WHERE id = $1', [insertRows[0].id]);
      res.status(201).json({ contact: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// Update contact
router.put(
  '/:id',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Invalid email'),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other', 'unspecified'])
      .withMessage('Invalid gender'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, phone, email, gender = 'unspecified' } = req.body;
      const userId = req.session.userId;
      const contactId = req.params.id;

      const { rows: existingRows } = await query(
        'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
        [contactId, userId]
      );
      if (!existingRows.length) return res.status(404).json({ error: 'Contact not found' });

      const normalized = normalizePhone(phone);
      if (!normalized || !isValidPhone(normalized)) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      // Check duplicate (exclude self)
      const { rows: dupRows } = await query(
        'SELECT id FROM contacts WHERE user_id = $1 AND phone = $2 AND id != $3',
        [userId, normalized, contactId]
      );
      if (dupRows.length) {
        return res.status(409).json({ error: 'Contact with this phone already exists' });
      }

      await query(
        'UPDATE contacts SET name = $1, phone = $2, email = $3, gender = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 AND user_id = $6',
        [name, normalized, email || null, gender, contactId, userId]
      );

      const { rows } = await query('SELECT * FROM contacts WHERE id = $1', [contactId]);
      res.json({ contact: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// Delete contact
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// CSV Import
router.post('/import', csvUpload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });

  try {
    const userId = req.session.userId;
    const waConnected = waService.getStatus(userId) === 'connected';

    const { contacts: parsed } = await parseContactsCSV(req.file.buffer);

    if (!parsed.length) {
      return res.status(400).json({ error: 'No contacts found in CSV' });
    }

    let imported = 0;
    let skippedDuplicate = 0;
    let skippedInvalid = 0;
    let skippedNoWhatsApp = 0;

    for (const row of parsed) {
      if (!row.name || !row.phone) {
        skippedInvalid++;
        continue;
      }

      const normalized = normalizePhone(row.phone);
      if (!normalized || !isValidPhone(normalized)) {
        skippedInvalid++;
        continue;
      }

      // Check duplicate
      const { rows: dupRows } = await query(
        'SELECT id FROM contacts WHERE user_id = $1 AND phone = $2',
        [userId, normalized]
      );
      if (dupRows.length) {
        skippedDuplicate++;
        continue;
      }

      // WhatsApp validation if connected
      if (waConnected) {
        try {
          const exists = await waService.checkNumberOnWhatsApp(userId, normalized);
          if (!exists) {
            skippedNoWhatsApp++;
            continue;
          }
        } catch {
          // If check fails, allow import
        }
      }

      await query(
        'INSERT INTO contacts (user_id, name, phone, email, gender) VALUES ($1, $2, $3, $4, $5)',
        [userId, row.name, normalized, row.email || null, row.gender || 'unspecified']
      );

      imported++;
    }

    res.json({
      success: true,
      summary: {
        total: parsed.length,
        imported,
        skippedDuplicate,
        skippedInvalid,
        skippedNoWhatsApp,
      },
    });
  } catch (err) {
    next(err);
  }
});

// CSV Export
router.get('/export/csv', async (req, res, next) => {
  try {
    const { rows: contacts } = await query(
      'SELECT * FROM contacts WHERE user_id = $1 ORDER BY name ASC',
      [req.session.userId]
    );

    const csv = await generateContactsCSV(contacts);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
