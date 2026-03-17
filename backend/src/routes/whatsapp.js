const express = require('express');
const { query } = require('../db');
const { requireUser } = require('../middleware/auth');
const waService = require('../services/whatsapp');

const router = express.Router();
router.use(requireUser);

// Get current WA status
router.get('/status', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { rows } = await query('SELECT wa_status FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    const liveStatus = waService.getStatus(userId);
    const conn = waService.getConnection(userId);

    res.json({
      status: liveStatus || user?.wa_status || 'disconnected',
      qr: conn?.qr || null,
    });
  } catch (err) {
    next(err);
  }
});

// Initiate connection
router.post('/connect', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const currentStatus = waService.getStatus(userId);

    if (currentStatus === 'connected') {
      return res.json({ status: 'connected' });
    }

    // Start connection (non-blocking)
    waService.connectWhatsApp(userId).catch((err) => {
      const logger = require('../utils/logger');
      logger.error({ err, userId }, 'Background WA connect failed');
    });

    res.json({ status: 'connecting' });
  } catch (err) {
    next(err);
  }
});

// Poll QR / status
router.get('/qr', (req, res) => {
  const userId = req.session.userId;
  const conn = waService.getConnection(userId);
  const status = waService.getStatus(userId);

  res.json({
    status: status || 'disconnected',
    qr: conn?.qr || null,
  });
});

// Disconnect
router.post('/disconnect', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    await waService.disconnectWhatsApp(userId);
    res.json({ success: true, status: 'disconnected' });
  } catch (err) {
    next(err);
  }
});

// Check if number is on WhatsApp
router.post('/check-number', async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const { normalizePhone } = require('../utils/phone');
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ error: 'Invalid phone' });

    const exists = await waService.checkNumberOnWhatsApp(req.session.userId, normalized);
    res.json({ exists, phone: normalized });
  } catch (err) {
    if (err.message === 'WhatsApp not connected') {
      return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    next(err);
  }
});

module.exports = router;
