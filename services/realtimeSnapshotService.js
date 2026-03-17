const UserModel = require('../models/userModel');
const CampaignModel = require('../models/campaignModel');
const { dbGet, dbAll } = require('../config/database');
const { getConnectionStatus } = require('../config/baileys');

function buildEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function buildUserSnapshot(userId, options = {}) {
  const normalizedUserId = Number(userId);
  const campaignId = Number(options.campaignId || 0);
  const includeCampaigns = options.includeCampaigns === true;

  const [stats, user, activeCampaigns] = await Promise.all([
    UserModel.getDashboardStats(normalizedUserId),
    UserModel.findById(normalizedUserId),
    CampaignModel.findActiveByUserId(normalizedUserId),
  ]);

  const snapshot = {
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          credits: user.credits,
        }
      : null,
    stats,
    activeCampaigns: Array.isArray(activeCampaigns) ? activeCampaigns : [],
    connectionStatus: getConnectionStatus(normalizedUserId),
    updatedAt: new Date().toISOString(),
    eventId: buildEventId(),
  };

  if (includeCampaigns) {
    const campaigns = await CampaignModel.findByUserId(normalizedUserId);
    snapshot.campaigns = Array.isArray(campaigns) ? campaigns : [];
  }

  if (Number.isInteger(campaignId) && campaignId > 0) {
    const campaign = await CampaignModel.findById(campaignId, normalizedUserId);
    if (campaign) {
      const campaignContacts = await CampaignModel.getCampaignContacts(campaignId);
      snapshot.campaignDetail = campaign;
      snapshot.campaignContacts = Array.isArray(campaignContacts) ? campaignContacts : [];
    } else {
      snapshot.campaignDetail = null;
      snapshot.campaignContacts = [];
    }
  }

  return snapshot;
}

async function buildAdminSnapshot() {
  const [users, runningCampaigns, totalTransactions, totalMessages] = await Promise.all([
    UserModel.getAllUsers(),
    CampaignModel.findRunningWithUsers(50),
    dbGet('SELECT COUNT(*) as count FROM credit_transactions'),
    dbGet('SELECT COUNT(*) as count FROM message_logs'),
  ]);

  const [totalUsers] = await Promise.all([dbGet('SELECT COUNT(*) as count FROM users')]);

  const recentCredits = await dbAll(
    `SELECT ct.user_id, ct.credits_added, ct.created_at, u.name, u.email
     FROM credit_transactions ct
     JOIN users u ON ct.user_id = u.id
     ORDER BY ct.created_at DESC
     LIMIT 10`
  );

  return {
    users: Array.isArray(users)
      ? users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          credits: user.credits,
          whatsapp_connected: user.whatsapp_connected,
        }))
      : [],
    runningCampaigns: Array.isArray(runningCampaigns) ? runningCampaigns : [],
    runningCount: Array.isArray(runningCampaigns) ? runningCampaigns.length : 0,
    totals: {
      users: totalUsers ? totalUsers.count : 0,
      transactions: totalTransactions ? totalTransactions.count : 0,
      messages: totalMessages ? totalMessages.count : 0,
    },
    recentCredits: Array.isArray(recentCredits) ? recentCredits : [],
    updatedAt: new Date().toISOString(),
    eventId: buildEventId(),
  };
}

module.exports = {
  buildUserSnapshot,
  buildAdminSnapshot,
};