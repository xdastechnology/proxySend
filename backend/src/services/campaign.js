const { query } = require('../db');
const logger = require('../utils/logger');
const waService = require('./whatsapp');
const sseService = require('./sse');

// Running campaign flags
const runningCampaigns = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function processTemplateVars(text, contact) {
  if (!text) return text;
  return text
    .replace(/\{\{name\}\}/gi, contact.name || '')
    .replace(/\{\{phone\}\}/gi, contact.phone || '')
    .replace(/\{\{email\}\}/gi, contact.email || '')
    .replace(/\{\{gender\}\}/gi, contact.gender || '');
}

function buildButtons(buttons) {
  if (!buttons || !buttons.length) return '';
  return (
    '\n\n' +
    buttons
      .map((btn, i) => `${i + 1}. ${btn.label}: ${btn.url}`)
      .join('\n')
  );
}

async function normalizeStaleCampaigns() {
  const result = await query(
    "UPDATE campaigns SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE status = 'running'"
  );
  if (result.rowCount > 0) {
    logger.info({ count: result.rowCount }, 'Reset stale running campaigns to pending');
  }
}

async function pauseCampaignForWhatsApp(campaignId, userId) {
  await query(
    "UPDATE campaigns SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [campaignId]
  );

  const { rows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  const updatedCampaign = rows[0] || { id: campaignId, status: 'pending' };

  const warning = {
    campaignId,
    code: 'whatsapp_not_connected',
    message: 'WhatsApp is not connected. Please connect WhatsApp and start the campaign again.',
  };

  sseService.broadcastToUser(userId, 'campaign_warning', warning);
  sseService.broadcastToCampaign(campaignId, 'campaign_warning', warning);
  sseService.broadcastToUser(userId, 'campaign_paused', { campaignId, reason: 'whatsapp_not_connected' });
  sseService.broadcastToCampaign(campaignId, 'campaign_update', updatedCampaign);
  sseService.broadcastToUser(userId, 'campaign_update', updatedCampaign);
}

async function runCampaign(campaignId, userId) {
  if (runningCampaigns.has(campaignId)) {
    logger.warn({ campaignId }, 'Campaign already running');
    return;
  }

  runningCampaigns.add(campaignId);

  try {
    // Mark campaign running
    await query(
      "UPDATE campaigns SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [campaignId]
    );

    const { rows: campaignRows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    const campaign = campaignRows[0];
    if (!campaign) throw new Error('Campaign not found');

    let template = null;
    if (campaign.template_id) {
      const { rows: templateRows } = await query('SELECT * FROM templates WHERE id = $1', [campaign.template_id]);
      template = templateRows[0] || null;
    }

    // Get pending contacts
    const { rows: pendingContacts } = await query(
      `SELECT cc.id as cc_id, cc.contact_id, c.name, c.phone, c.email, c.gender
       FROM campaign_contacts cc
       JOIN contacts c ON c.id = cc.contact_id
       WHERE cc.campaign_id = $1 AND cc.status = 'pending'
       ORDER BY cc.id ASC`,
      [campaignId]
    );

    logger.info({ campaignId, count: pendingContacts.length }, 'Starting campaign run');

    const connected = await waService.ensureConnected(userId, { timeoutMs: 5000, pollMs: 250 });
    if (!connected) {
      logger.warn({ campaignId, userId }, 'WhatsApp not connected after auto-connect attempt, pausing campaign');
      await pauseCampaignForWhatsApp(campaignId, userId);
      return;
    }

    let buttons = [];
    try {
      buttons = template?.buttons ? JSON.parse(template.buttons) : [];
    } catch {}

    for (const contact of pendingContacts) {
      // Check if campaign was paused/cancelled externally
      const { rows: freshRows } = await query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
      const fresh = freshRows[0];
      if (!fresh || fresh.status !== 'running') {
        logger.info({ campaignId }, 'Campaign paused or cancelled externally');
        break;
      }

      // Check WhatsApp connection
      if (waService.getStatus(userId) !== 'connected') {
        logger.warn({ campaignId, userId }, 'WhatsApp disconnected mid-campaign, pausing');
        await pauseCampaignForWhatsApp(campaignId, userId);
        break;
      }

      // Check credits
      const { rows: userRows } = await query('SELECT credits FROM users WHERE id = $1', [userId]);
      const user = userRows[0];
      if (!user || user.credits < 1) {
        logger.warn({ campaignId, userId }, 'Insufficient credits, stopping campaign');

        // Mark remaining pending as failed
        await query(
          "UPDATE campaign_contacts SET status = 'failed', error_note = 'Insufficient credits' WHERE campaign_id = $1 AND status = 'pending'",
          [campaignId]
        );

        const { rows: countRows } = await query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
           FROM campaign_contacts WHERE campaign_id = $1`,
          [campaignId]
        );
        const counts = countRows[0];

        await query(
          "UPDATE campaigns SET status = 'completed', sent_count = $1, failed_count = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
          [parseInt(counts.sent) || 0, parseInt(counts.failed) || 0, campaignId]
        );

        sseService.broadcastToUser(userId, 'campaign_completed', { campaignId, reason: 'no_credits' });
        sseService.broadcastToCampaign(campaignId, 'campaign_update', {
          status: 'completed',
          reason: 'no_credits',
        });
        break;
      }

      // Build message
      let messageText = template?.message ? processTemplateVars(template.message, contact) : '';
      messageText += buildButtons(buttons);

      // Send message
      let sendResult;
      try {
        let payload;

        if (template?.media_path) {
          const fs = require('fs');
          const mediaBuffer = fs.readFileSync(template.media_path);
          const captionText = messageText || undefined;

          if (template.media_type === 'image') {
            payload = { image: mediaBuffer, caption: captionText, mimetype: template.media_mime };
          } else if (template.media_type === 'video') {
            payload = { video: mediaBuffer, caption: captionText, mimetype: template.media_mime };
          } else {
            payload = {
              document: mediaBuffer,
              caption: captionText,
              mimetype: template.media_mime,
              fileName: template.media_original_name,
            };
          }
        } else if (messageText) {
          payload = { text: messageText };
        }

        if (!payload) {
          sendResult = { success: false, error: 'No message content' };
        } else {
          sendResult = await waService.sendMessage(userId, contact.phone, payload);
        }
      } catch (err) {
        sendResult = { success: false, error: err.message };
      }

      const now = new Date().toISOString();

      if (sendResult.success) {
        // Mark as sent
        await query(
          "UPDATE campaign_contacts SET status = 'sent', sent_at = $1, error_note = NULL WHERE id = $2",
          [now, contact.cc_id]
        );

        // Deduct credit
        await query(
          'UPDATE users SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [userId]
        );

        // Log transaction
        await query(
          "INSERT INTO credit_transactions (user_id, amount, type, note, campaign_id) VALUES ($1, -1, 'campaign_send', $2, $3)",
          [userId, `Sent to ${contact.phone} in campaign ${campaign.campaign_name}`, campaignId]
        );

        // Log message
        await query(
          "INSERT INTO message_logs (user_id, campaign_id, contact_id, phone, status, sent_at) VALUES ($1, $2, $3, $4, 'sent', $5)",
          [userId, campaignId, contact.contact_id, contact.phone, now]
        );

        // Update campaign counts
        await query(
          'UPDATE campaigns SET sent_count = sent_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [campaignId]
        );

        // Broadcast update
        const { rows: updatedRows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
        const updatedCampaign = updatedRows[0];
        sseService.broadcastToCampaign(campaignId, 'campaign_update', updatedCampaign);
        sseService.broadcastToUser(userId, 'campaign_update', updatedCampaign);
        sseService.broadcastToUser(userId, 'credits_update', {
          credits: user.credits - 1,
        });

        await sleep(randomDelay(5, 10));
      } else {
        // Mark as failed
        await query(
          "UPDATE campaign_contacts SET status = 'failed', error_note = $1 WHERE id = $2",
          [sendResult.error || 'Unknown error', contact.cc_id]
        );

        // Log message
        await query(
          "INSERT INTO message_logs (user_id, campaign_id, contact_id, phone, status, error, sent_at) VALUES ($1, $2, $3, $4, 'failed', $5, $6)",
          [userId, campaignId, contact.contact_id, contact.phone, sendResult.error, now]
        );

        // Update campaign counts
        await query(
          'UPDATE campaigns SET failed_count = failed_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [campaignId]
        );

        const { rows: updatedRows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
        sseService.broadcastToCampaign(campaignId, 'campaign_update', updatedRows[0]);
        sseService.broadcastToUser(userId, 'campaign_update', updatedRows[0]);

        await sleep(randomDelay(2, 4));
      }
    }

    // Check if campaign should be marked completed
    const { rows: finalRows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    const finalCampaign = finalRows[0];
    if (finalCampaign && finalCampaign.status === 'running') {
      const { rows: pendingRows } = await query(
        "SELECT COUNT(*) as count FROM campaign_contacts WHERE campaign_id = $1 AND status = 'pending'",
        [campaignId]
      );

      if (parseInt(pendingRows[0].count) === 0) {
        await query(
          "UPDATE campaigns SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [campaignId]
        );

        const { rows: completedRows } = await query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
        const completedCampaign = completedRows[0];
        sseService.broadcastToCampaign(campaignId, 'campaign_update', completedCampaign);
        sseService.broadcastToUser(userId, 'campaign_update', completedCampaign);
        sseService.broadcastToUser(userId, 'campaign_completed', { campaignId });
        sseService.broadcastToAdmins('stats_update', {});
        logger.info({ campaignId }, 'Campaign completed');
      }
    }
  } catch (err) {
    logger.error({ err, campaignId }, 'Campaign run error');
    try {
      await query(
        "UPDATE campaigns SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'running'",
        [campaignId]
      );
    } catch {}
  } finally {
    runningCampaigns.delete(campaignId);
  }
}

module.exports = { runCampaign, normalizeStaleCampaigns };
