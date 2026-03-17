// services/campaignService.js
const CampaignModel = require('../models/campaignModel');
const UserModel = require('../models/userModel');
const TemplateModel = require('../models/templateModel');
const { sendWhatsAppMessage, ensureConnectedSocket } = require('../config/baileys');
const mediaStorageService = require('./mediaStorageService');
const logger = require('../config/logger');
const {
  publishCampaignUpdate,
  publishUserUpdate,
  publishAdminUpdate,
} = require('./realtimeService');

const runningCampaigns = new Set();

function randomDelay(min = 5000, max = 10000) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
  );
}

function parseTemplateButtons(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        label: (item.label || '').toString().trim(),
        url: (item.url || '').toString().trim(),
      }))
      .filter((item) => item.label && item.url)
      .slice(0, 3);
  } catch (err) {
    return [];
  }
}

function appendButtonsToMessage(message, buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return message || '';
  }

  const links = buttons
    .map((btn, idx) => `${idx + 1}. ${btn.label}: ${btn.url}`)
    .join('\n');

  if (!message) {
    return links;
  }

  return `${message}\n\n${links}`;
}

async function buildMessagePayload(campaign, message) {
  const mediaPath = campaign.template_media_path;
  if (!mediaPath) {
    if (!message) {
      throw new Error('Template has no message or media content');
    }
    return { text: message };
  }

  const mediaRef = await mediaStorageService.resolveMediaForSend(mediaPath);
  if (!mediaRef || !mediaRef.value) {
    throw new Error('Template media file not found on server');
  }

  const source = mediaRef.value;

  const mediaType = (campaign.template_media_type || 'document').toLowerCase();
  const caption = message || undefined;

  if (mediaType === 'image') {
    return {
      image: { url: source },
      caption,
    };
  }

  if (mediaType === 'video') {
    return {
      video: { url: source },
      caption,
    };
  }

  return {
    document: { url: source },
    caption,
    mimetype: campaign.template_media_mime || 'application/pdf',
    fileName: campaign.template_media_name || 'attachment',
  };
}

async function runCampaign(userId, campaignId) {
  const normalizedUserId = Number(userId);
  const normalizedCampaignId = Number(campaignId);

  if (!Number.isInteger(normalizedUserId) || !Number.isInteger(normalizedCampaignId)) {
    logger.error(`Invalid campaign run parameters: userId=${userId}, campaignId=${campaignId}`);
    return;
  }

  if (runningCampaigns.has(normalizedCampaignId)) {
    logger.warn(`Campaign ${normalizedCampaignId} is already running`);
    return;
  }

  runningCampaigns.add(normalizedCampaignId);
  publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_queued');

  try {
    const campaign = await CampaignModel.findById(normalizedCampaignId, normalizedUserId);

    if (!campaign) {
      logger.error(`Campaign ${normalizedCampaignId} not found`);
      return;
    }

    const connectedAtStart = await ensureConnectedSocket(normalizedUserId, 15000);
    if (!connectedAtStart) {
      logger.error(`No active WhatsApp socket for user ${normalizedUserId}`);
      return;
    }

    await CampaignModel.updateStatus(normalizedCampaignId, 'running');
    publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_started');
    logger.info(`Campaign ${normalizedCampaignId} started for user ${normalizedUserId}`);

    const campaignContacts = await CampaignModel.getCampaignContacts(normalizedCampaignId);
    let sentCount = 0;
    let failedCount = 0;
    let disconnectedDuringRun = false;

    for (const cc of campaignContacts) {
      if (cc.status !== 'pending') continue;

      const stillConnected = await ensureConnectedSocket(normalizedUserId, 10000);
      if (!stillConnected) {
        disconnectedDuringRun = true;
        logger.warn(`WhatsApp disconnected during campaign ${normalizedCampaignId}. Pausing campaign.`);
        break;
      }

      const user = await UserModel.findById(normalizedUserId);

      if (!user || user.credits <= 0) {
        logger.warn(`User ${normalizedUserId} ran out of credits. Stopping campaign ${normalizedCampaignId}`);
        await CampaignModel.updateContactStatus(cc.id, 'failed', 'Insufficient credits');
        failedCount++;
        await CampaignModel.updateCounts(normalizedCampaignId, sentCount, failedCount);
        publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_progress');
        break;
      }

      try {
        const message = TemplateModel.processTemplate(campaign.template_message, {
          name: cc.name,
          phone: cc.phone,
        });

        const buttons = parseTemplateButtons(campaign.template_buttons_json);
        const finalMessage = appendButtonsToMessage(message, buttons);

        const payload = await buildMessagePayload(campaign, finalMessage);
        await sendWhatsAppMessage(normalizedUserId, cc.phone, payload);

        const deducted = await UserModel.deductCredit(normalizedUserId);

        if (!deducted) {
          await CampaignModel.updateContactStatus(cc.id, 'failed', 'Credit deduction failed');
          failedCount++;
          await CampaignModel.updateCounts(normalizedCampaignId, sentCount, failedCount);
          publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_progress');
          continue;
        }

        await CampaignModel.updateContactStatus(cc.id, 'sent');
        sentCount++;

        await CampaignModel.logMessage(normalizedUserId, normalizedCampaignId, cc.phone, cc.name, finalMessage, 'sent');
        await CampaignModel.updateCounts(normalizedCampaignId, sentCount, failedCount);
        publishUserUpdate(normalizedUserId, 'credits_updated', { campaignId: normalizedCampaignId });
        publishAdminUpdate('credits_updated', { userId: normalizedUserId, campaignId: normalizedCampaignId });
        publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_progress', {
          contactId: cc.id,
          status: 'sent',
        });

        logger.info(`Message sent to ${cc.phone} in campaign ${normalizedCampaignId}`);

        await randomDelay(5000, 10000);
      } catch (sendErr) {
        logger.error(`Failed to send to ${cc.phone}: ${sendErr.message}`);
        await CampaignModel.updateContactStatus(cc.id, 'failed', sendErr.message);
        failedCount++;
        await CampaignModel.updateCounts(normalizedCampaignId, sentCount, failedCount);
        publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_progress', {
          contactId: cc.id,
          status: 'failed',
        });
        await randomDelay(2000, 4000);
      }
    }

    if (disconnectedDuringRun) {
      await CampaignModel.updateStatus(normalizedCampaignId, 'pending');
      await CampaignModel.updateCounts(normalizedCampaignId, sentCount, failedCount);
      publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_paused');
      return;
    }

    await CampaignModel.updateStatus(normalizedCampaignId, 'completed');
    await CampaignModel.updateCounts(normalizedCampaignId, sentCount, failedCount);
    publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_completed');
    logger.info(`Campaign ${normalizedCampaignId} completed. Sent: ${sentCount}, Failed: ${failedCount}`);
  } catch (err) {
    logger.error(`Campaign ${normalizedCampaignId} error: ${err.message}`);
    await CampaignModel.updateStatus(normalizedCampaignId, 'completed');
    publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_failed');
  } finally {
    runningCampaigns.delete(normalizedCampaignId);
    publishCampaignUpdate(normalizedUserId, normalizedCampaignId, 'campaign_idle');
  }
}

function isCampaignRunning(campaignId) {
  const normalizedCampaignId = Number(campaignId);
  return Number.isInteger(normalizedCampaignId) && runningCampaigns.has(normalizedCampaignId);
}

async function normalizeStaleRunningCampaigns() {
  const changes = await CampaignModel.normalizeRunningToPending();
  if (changes > 0) {
    logger.warn(`Normalized ${changes} stale running campaign(s) to pending on startup`);
    publishAdminUpdate('campaign_normalized', { changes });
  }
  return changes;
}

module.exports = { runCampaign, isCampaignRunning, normalizeStaleRunningCampaigns };