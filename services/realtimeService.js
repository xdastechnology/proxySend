const { EventEmitter } = require('events');

const realtimeEmitter = new EventEmitter();
realtimeEmitter.setMaxListeners(0);

function publishUserUpdate(userId, reason = 'update', extra = {}) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return;
  }

  realtimeEmitter.emit('user-update', {
    userId: normalizedUserId,
    reason,
    extra,
    at: new Date().toISOString(),
  });
}

function publishAdminUpdate(reason = 'update', extra = {}) {
  realtimeEmitter.emit('admin-update', {
    reason,
    extra,
    at: new Date().toISOString(),
  });
}

function publishCampaignUpdate(userId, campaignId, reason = 'campaign_update', extra = {}) {
  const normalizedCampaignId = Number(campaignId);
  publishUserUpdate(userId, reason, {
    campaignId: Number.isInteger(normalizedCampaignId) ? normalizedCampaignId : null,
    ...extra,
  });
  publishAdminUpdate(reason, {
    userId: Number(userId),
    campaignId: Number.isInteger(normalizedCampaignId) ? normalizedCampaignId : null,
    ...extra,
  });
}

function onUserUpdate(listener) {
  realtimeEmitter.on('user-update', listener);
  return () => realtimeEmitter.off('user-update', listener);
}

function onAdminUpdate(listener) {
  realtimeEmitter.on('admin-update', listener);
  return () => realtimeEmitter.off('admin-update', listener);
}

module.exports = {
  publishUserUpdate,
  publishAdminUpdate,
  publishCampaignUpdate,
  onUserUpdate,
  onAdminUpdate,
};