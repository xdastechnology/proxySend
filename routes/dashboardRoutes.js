// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const UserModel = require('../models/userModel');
const CampaignModel = require('../models/campaignModel');
const logger = require('../config/logger');
const { getConnectionStatus } = require('../config/baileys');
const { buildUserSnapshot } = require('../services/realtimeSnapshotService');

async function getDashboardPayload(userId) {
  const [stats, user, activeCampaigns] = await Promise.all([
    UserModel.getDashboardStats(userId),
    UserModel.findById(userId),
    CampaignModel.findActiveByUserId(userId),
  ]);
  const connectionStatus = getConnectionStatus(userId);

  return {
    stats,
    user,
    activeCampaigns: Array.isArray(activeCampaigns) ? activeCampaigns : [],
    connectionStatus,
  };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { stats, user, activeCampaigns, connectionStatus } = await getDashboardPayload(userId);

    // Refresh session credits
    if (user) req.session.user.credits = user.credits;

    res.render('dashboard', {
      title: 'Dashboard - ProxySend',
      stats,
      user,
      activeCampaigns,
      connectionStatus,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`Dashboard error: ${err.message}`);
    res.redirect('/login?error=Session error. Please login again.');
  }
});

router.get('/realtime', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const campaignId = Number(req.query.campaignId || 0);
    const includeCampaigns = req.query.includeCampaigns === '1';
    const snapshot = await buildUserSnapshot(userId, {
      includeCampaigns,
      campaignId: Number.isInteger(campaignId) && campaignId > 0 ? campaignId : undefined,
    });

    if (snapshot.user) req.session.user.credits = snapshot.user.credits;

    res.json({
      success: true,
      ...snapshot,
    });
  } catch (err) {
    logger.error(`Dashboard realtime error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to load dashboard updates' });
  }
});

module.exports = router;