const express = require('express');
const router = express.Router();
const logger = require('../config/logger');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');
const CampaignModel = require('../models/campaignModel');
const {
  onUserUpdate,
  onAdminUpdate,
} = require('../services/realtimeService');
const {
  buildUserSnapshot,
  buildAdminSnapshot,
} = require('../services/realtimeSnapshotService');

function initSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function sendSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.get('/stream', requireAuth, async (req, res) => {
  const userId = Number(req.session.user.id);
  const includeCampaigns = req.query.includeCampaigns === '1';
  const campaignId = Number(req.query.campaignId || 0);

  initSse(res);

  const pushSnapshot = async (reason = 'snapshot', extra = {}) => {
    const snapshot = await buildUserSnapshot(userId, {
      includeCampaigns,
      campaignId: Number.isInteger(campaignId) && campaignId > 0 ? campaignId : undefined,
    });
    if (snapshot.user) {
      req.session.user.credits = snapshot.user.credits;
    }
    sendSseEvent(res, 'state', {
      success: true,
      reason,
      ...snapshot,
      extra,
    });
  };

  try {
    await pushSnapshot('initial');
  } catch (err) {
    logger.error(`Realtime stream init error (user ${userId}): ${err.message}`);
    sendSseEvent(res, 'error', { success: false, message: 'Failed to initialize stream' });
  }

  const unsubscribe = onUserUpdate((event) => {
    if (event.userId !== userId) return;
    pushSnapshot(event.reason, event.extra).catch((err) => {
      logger.error(`Realtime stream push error (user ${userId}): ${err.message}`);
    });
  });

  const heartbeatTimer = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  const snapshotTimer = setInterval(() => {
    pushSnapshot('tick').catch((err) => {
      logger.error(`Realtime stream tick error (user ${userId}): ${err.message}`);
    });
  }, 5000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    clearInterval(snapshotTimer);
    unsubscribe();
    res.end();
  });
});

router.get('/campaign/:id/stream', requireAuth, async (req, res) => {
  const userId = Number(req.session.user.id);
  const campaignId = Number(req.params.id);

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid campaign id' });
  }

  const campaign = await CampaignModel.findById(campaignId, userId);
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }

  initSse(res);

  const pushSnapshot = async (reason = 'snapshot', extra = {}) => {
    const snapshot = await buildUserSnapshot(userId, { campaignId });
    if (snapshot.user) {
      req.session.user.credits = snapshot.user.credits;
    }
    sendSseEvent(res, 'campaign-state', {
      success: true,
      reason,
      ...snapshot,
      extra,
    });
  };

  try {
    await pushSnapshot('initial');
  } catch (err) {
    logger.error(`Campaign stream init error (${campaignId}): ${err.message}`);
    sendSseEvent(res, 'error', { success: false, message: 'Failed to initialize campaign stream' });
  }

  const unsubscribe = onUserUpdate((event) => {
    if (event.userId !== userId) return;
    pushSnapshot(event.reason, event.extra).catch((err) => {
      logger.error(`Campaign stream push error (${campaignId}): ${err.message}`);
    });
  });

  const heartbeatTimer = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  const snapshotTimer = setInterval(() => {
    pushSnapshot('tick').catch((err) => {
      logger.error(`Campaign stream tick error (${campaignId}): ${err.message}`);
    });
  }, 4000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    clearInterval(snapshotTimer);
    unsubscribe();
    res.end();
  });
});

router.get('/admin/stream', requireAdmin, async (req, res) => {
  initSse(res);

  const pushSnapshot = async (reason = 'snapshot', extra = {}) => {
    const snapshot = await buildAdminSnapshot();
    sendSseEvent(res, 'admin-state', {
      success: true,
      reason,
      ...snapshot,
      extra,
    });
  };

  try {
    await pushSnapshot('initial');
  } catch (err) {
    logger.error(`Admin realtime init error: ${err.message}`);
    sendSseEvent(res, 'error', { success: false, message: 'Failed to initialize admin stream' });
  }

  const unsubscribe = onAdminUpdate((event) => {
    pushSnapshot(event.reason, event.extra).catch((err) => {
      logger.error(`Admin realtime push error: ${err.message}`);
    });
  });

  const heartbeatTimer = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  const snapshotTimer = setInterval(() => {
    pushSnapshot('tick').catch((err) => {
      logger.error(`Admin realtime tick error: ${err.message}`);
    });
  }, 6000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    clearInterval(snapshotTimer);
    unsubscribe();
    res.end();
  });
});

router.get('/admin/poll', requireAdmin, async (req, res) => {
  try {
    const snapshot = await buildAdminSnapshot();
    res.json({ success: true, ...snapshot });
  } catch (err) {
    logger.error(`Admin realtime poll error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to load admin realtime data' });
  }
});

module.exports = router;