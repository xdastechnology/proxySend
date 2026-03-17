const express = require('express');
const { query } = require('../db');
const { requireUser, requireAdmin } = require('../middleware/auth');
const sseService = require('../services/sse');
const waService = require('../services/whatsapp');

const router = express.Router();

// User SSE stream
router.get('/user', requireUser, async (req, res, next) => {
  try {
    const userId = req.session.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseService.addUserClient(userId, res);

    // Send initial snapshot
    const { rows } = await query('SELECT credits, wa_status FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    const liveStatus = waService.getStatus(userId);
    const conn = waService.getConnection(userId);

    sseService.sendEvent(res, 'snapshot', {
      credits: user?.credits || 0,
      wa_status: liveStatus || user?.wa_status || 'disconnected',
      qr: conn?.qr || null,
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseService.removeUserClient(userId, res);
    });
  } catch (err) {
    next(err);
  }
});

// Campaign detail SSE stream
router.get('/campaign/:id', requireUser, async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const campaignId = req.params.id;

    const { rows } = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );
    const campaign = rows[0];

    if (!campaign) {
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseService.addCampaignClient(campaignId, res);

    // Send initial snapshot
    sseService.sendEvent(res, 'campaign_update', campaign);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseService.removeCampaignClient(campaignId, res);
    });
  } catch (err) {
    next(err);
  }
});

// Admin SSE stream
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseService.addAdminClient(res);

    const getStats = async () => {
      const [r1, r2, r3, r4] = await Promise.all([
        query('SELECT COUNT(*) as c FROM users'),
        query("SELECT COUNT(*) as c FROM message_logs WHERE status = 'sent'"),
        query('SELECT COUNT(*) as c FROM credit_transactions'),
        query("SELECT COUNT(*) as c FROM credit_requests WHERE status = 'pending'"),
      ]);
      return {
        totalUsers: parseInt(r1.rows[0].c),
        totalMessages: parseInt(r2.rows[0].c),
        totalTransactions: parseInt(r3.rows[0].c),
        pendingRequests: parseInt(r4.rows[0].c),
      };
    };

    // Send initial snapshot
    const stats = await getStats();
    sseService.sendEvent(res, 'admin_snapshot', stats);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Periodic stats push
    const statsPush = setInterval(async () => {
      try {
        const liveStats = await getStats();
        sseService.sendEvent(res, 'admin_snapshot', liveStats);
      } catch {
        clearInterval(statsPush);
      }
    }, 60000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clearInterval(statsPush);
      sseService.removeAdminClient(res);
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
