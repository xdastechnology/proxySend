// Server-Sent Events service for broadcasting realtime updates
const logger = require('../utils/logger');

// Map of userId -> Set of response objects
const userClients = new Map();
// Map of campaignId -> Set of response objects
const campaignClients = new Map();
// Set of admin response objects
const adminClients = new Set();

function addUserClient(userId, res) {
  if (!userClients.has(userId)) userClients.set(userId, new Set());
  userClients.get(userId).add(res);
  logger.debug({ userId, count: userClients.get(userId).size }, 'SSE user client added');
}

function removeUserClient(userId, res) {
  if (userClients.has(userId)) {
    userClients.get(userId).delete(res);
    if (userClients.get(userId).size === 0) userClients.delete(userId);
  }
}

function addCampaignClient(campaignId, res) {
  const key = String(campaignId);
  if (!campaignClients.has(key)) campaignClients.set(key, new Set());
  campaignClients.get(key).add(res);
}

function removeCampaignClient(campaignId, res) {
  const key = String(campaignId);
  if (campaignClients.has(key)) {
    campaignClients.get(key).delete(res);
    if (campaignClients.get(key).size === 0) campaignClients.delete(key);
  }
}

function addAdminClient(res) {
  adminClients.add(res);
  logger.debug({ count: adminClients.size }, 'SSE admin client added');
}

function removeAdminClient(res) {
  adminClients.delete(res);
}

function sendEvent(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    logger.debug({ err: err.message }, 'Failed to send SSE event');
  }
}

function broadcastToUser(userId, event, data) {
  const clients = userClients.get(String(userId));
  if (!clients) return;
  for (const res of clients) {
    sendEvent(res, event, data);
  }
}

function broadcastToCampaign(campaignId, event, data) {
  const clients = campaignClients.get(String(campaignId));
  if (!clients) return;
  for (const res of clients) {
    sendEvent(res, event, data);
  }
}

function broadcastToAdmins(event, data) {
  for (const res of adminClients) {
    sendEvent(res, event, data);
  }
}

module.exports = {
  addUserClient,
  removeUserClient,
  addCampaignClient,
  removeCampaignClient,
  addAdminClient,
  removeAdminClient,
  broadcastToUser,
  broadcastToCampaign,
  broadcastToAdmins,
  sendEvent,
};
