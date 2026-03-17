const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body } = require('express-validator');
const { query } = require('../db');
const { requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireUser);

const ALLOWED_MEDIA_TYPES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/3gpp': 'video',
  'application/pdf': 'document',
};

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(config.uploadsDir, 'templates');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const { v4: uuidv4 } = require('uuid');
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: config.maxUploadSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MEDIA_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use image, video, or PDF.'));
    }
  },
});

function parseButtons(raw) {
  if (!raw) return [];
  let buttons;
  try {
    buttons = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(buttons)) return [];

  return buttons
    .slice(0, 3)
    .map((btn) => ({
      label: String(btn.label || '').trim().slice(0, 30),
      url: String(btn.url || '').trim(),
    }))
    .filter(
      (btn) =>
        btn.label &&
        btn.url &&
        (btn.url.startsWith('http://') || btn.url.startsWith('https://'))
    );
}

// List templates
router.get('/', async (req, res, next) => {
  try {
    const { rows: templates } = await query(
      'SELECT * FROM templates WHERE user_id = $1 ORDER BY created_at DESC',
      [req.session.userId]
    );

    const result = templates.map((t) => ({
      ...t,
      buttons: t.buttons ? JSON.parse(t.buttons) : [],
    }));

    res.json({ templates: result });
  } catch (err) {
    next(err);
  }
});

// Get single template
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    const template = rows[0];

    if (!template) return res.status(404).json({ error: 'Template not found' });

    res.json({
      template: {
        ...template,
        buttons: template.buttons ? JSON.parse(template.buttons) : [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// Create template
router.post(
  '/',
  mediaUpload.single('media'),
  async (req, res, next) => {
    try {
      const { templateName, message, buttons: rawButtons } = req.body;
      const userId = req.session.userId;

      if (!templateName || !String(templateName).trim()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Template name is required' });
      }

      if (!message && !req.file) {
        return res.status(400).json({ error: 'Template must have message or media' });
      }

      const buttons = parseButtons(rawButtons);

      let mediaData = {};
      if (req.file) {
        mediaData = {
          media_path: req.file.path,
          media_type: ALLOWED_MEDIA_TYPES[req.file.mimetype],
          media_mime: req.file.mimetype,
          media_original_name: req.file.originalname,
        };
      }

      const { rows: insertRows } = await query(
        `INSERT INTO templates
          (user_id, template_name, message, media_path, media_type, media_mime, media_original_name, buttons)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          String(templateName).trim(),
          message ? String(message).trim() : null,
          mediaData.media_path || null,
          mediaData.media_type || null,
          mediaData.media_mime || null,
          mediaData.media_original_name || null,
          buttons.length ? JSON.stringify(buttons) : null,
        ]
      );

      const { rows } = await query('SELECT * FROM templates WHERE id = $1', [insertRows[0].id]);
      const template = rows[0];

      res.status(201).json({
        template: {
          ...template,
          buttons: template.buttons ? JSON.parse(template.buttons) : [],
        },
      });
    } catch (err) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      next(err);
    }
  }
);

// Update template
router.put('/:id', mediaUpload.single('media'), async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const templateId = req.params.id;

    const { rows: existingRows } = await query(
      'SELECT * FROM templates WHERE id = $1 AND user_id = $2',
      [templateId, userId]
    );
    const existing = existingRows[0];

    if (!existing) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ error: 'Template not found' });
    }

    const { templateName, message, buttons: rawButtons, removeMedia } = req.body;

    if (!templateName || !String(templateName).trim()) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Template name is required' });
    }

    const buttons = parseButtons(rawButtons);

    let mediaData = {
      media_path: existing.media_path,
      media_type: existing.media_type,
      media_mime: existing.media_mime,
      media_original_name: existing.media_original_name,
    };

    if (removeMedia === 'true' || removeMedia === true) {
      if (existing.media_path) {
        try { fs.unlinkSync(existing.media_path); } catch {}
      }
      mediaData = { media_path: null, media_type: null, media_mime: null, media_original_name: null };
    }

    if (req.file) {
      if (existing.media_path) {
        try { fs.unlinkSync(existing.media_path); } catch {}
      }
      mediaData = {
        media_path: req.file.path,
        media_type: ALLOWED_MEDIA_TYPES[req.file.mimetype],
        media_mime: req.file.mimetype,
        media_original_name: req.file.originalname,
      };
    }

    const newMessage = message !== undefined ? (String(message).trim() || null) : existing.message;

    if (!newMessage && !mediaData.media_path) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Template must have message or media' });
    }

    await query(
      `UPDATE templates SET
        template_name = $1,
        message = $2,
        media_path = $3,
        media_type = $4,
        media_mime = $5,
        media_original_name = $6,
        buttons = $7,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9`,
      [
        String(templateName).trim(),
        newMessage,
        mediaData.media_path,
        mediaData.media_type,
        mediaData.media_mime,
        mediaData.media_original_name,
        buttons.length ? JSON.stringify(buttons) : null,
        templateId,
        userId,
      ]
    );

    const { rows } = await query('SELECT * FROM templates WHERE id = $1', [templateId]);
    const updated = rows[0];
    res.json({
      template: {
        ...updated,
        buttons: updated.buttons ? JSON.parse(updated.buttons) : [],
      },
    });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    next(err);
  }
});

// Delete template
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    const template = rows[0];

    if (!template) return res.status(404).json({ error: 'Template not found' });

    if (template.media_path) {
      try { fs.unlinkSync(template.media_path); } catch {}
    }

    await query(
      'DELETE FROM templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
