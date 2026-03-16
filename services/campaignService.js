// services/campaignService.js
const CampaignModel = require('../models/campaignModel');
const UserModel = require('../models/userModel');
const TemplateModel = require('../models/templateModel');
const { sendWhatsAppMessage, ensureConnectedSocket } = require('../config/baileys');
const mediaStorageService = require('./mediaStorageService');
const logger = require('../config/logger');

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
  if (runningCampaigns.has(campaignId)) {
    logger.warn(`Campaign ${campaignId} is already running`);
    return;
  }

  runningCampaigns.add(campaignId);

  try {
    const campaign = await CampaignModel.findById(campaignId, userId);

    if (!campaign) {
      logger.error(`Campaign ${campaignId} not found`);
      return;
    }

    const connectedAtStart = await ensureConnectedSocket(userId, 15000);
    if (!connectedAtStart) {
      logger.error(`No active WhatsApp socket for user ${userId}`);
      return;
    }

    await CampaignModel.updateStatus(campaignId, 'running');
    logger.info(`Campaign ${campaignId} started for user ${userId}`);

    const campaignContacts = await CampaignModel.getCampaignContacts(campaignId);
    let sentCount = 0;
    let failedCount = 0;
    let disconnectedDuringRun = false;

    for (const cc of campaignContacts) {
      if (cc.status !== 'pending') continue;

      const stillConnected = await ensureConnectedSocket(userId, 10000);
      if (!stillConnected) {
        disconnectedDuringRun = true;
        logger.warn(`WhatsApp disconnected during campaign ${campaignId}. Pausing campaign.`);
        break;
      }

      const user = await UserModel.findById(userId);

      if (!user || user.credits <= 0) {
        logger.warn(`User ${userId} ran out of credits. Stopping campaign ${campaignId}`);
        await CampaignModel.updateContactStatus(cc.id, 'failed', 'Insufficient credits');
        failedCount++;
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
        await sendWhatsAppMessage(userId, cc.phone, payload);

        const deducted = await UserModel.deductCredit(userId);

        if (!deducted) {
          await CampaignModel.updateContactStatus(cc.id, 'failed', 'Credit deduction failed');
          failedCount++;
          continue;
        }

        await CampaignModel.updateContactStatus(cc.id, 'sent');
        sentCount++;

        await CampaignModel.logMessage(userId, campaignId, cc.phone, cc.name, finalMessage, 'sent');
        await CampaignModel.updateCounts(campaignId, sentCount, failedCount);

        logger.info(`Message sent to ${cc.phone} in campaign ${campaignId}`);

        await randomDelay(5000, 10000);
      } catch (sendErr) {
        logger.error(`Failed to send to ${cc.phone}: ${sendErr.message}`);
        await CampaignModel.updateContactStatus(cc.id, 'failed', sendErr.message);
        failedCount++;
        await CampaignModel.updateCounts(campaignId, sentCount, failedCount);
        await randomDelay(2000, 4000);
      }
    }

    if (disconnectedDuringRun) {
      await CampaignModel.updateStatus(campaignId, 'pending');
      await CampaignModel.updateCounts(campaignId, sentCount, failedCount);
      return;
    }

    await CampaignModel.updateStatus(campaignId, 'completed');
    await CampaignModel.updateCounts(campaignId, sentCount, failedCount);
    logger.info(`Campaign ${campaignId} completed. Sent: ${sentCount}, Failed: ${failedCount}`);
  } catch (err) {
    logger.error(`Campaign ${campaignId} error: ${err.message}`);
    await CampaignModel.updateStatus(campaignId, 'completed');
  } finally {
    runningCampaigns.delete(campaignId);
  }
}

function isCampaignRunning(campaignId) {
  return runningCampaigns.has(campaignId);
}

module.exports = { runCampaign, isCampaignRunning };