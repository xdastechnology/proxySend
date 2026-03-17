// models/campaignModel.js
const { dbRun, dbGet, dbAll, dbTransaction } = require('../config/database');

class CampaignModel {
  static async create({ userId, campaignName, templateId, contactIds }) {
    return dbTransaction(async (tx) => {
      const campaignResult = await tx.run(
        'INSERT INTO campaigns (user_id, campaign_name, template_id, total_contacts) VALUES (?, ?, ?, ?)',
        [userId, campaignName, templateId, contactIds.length]
      );
      const campaignId = campaignResult.lastID;

      for (const contactId of contactIds) {
        await tx.run(
          'INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES (?, ?)',
          [campaignId, contactId]
        );
      }

      return campaignId;
    });
  }

  static async findByUserId(userId) {
    return await dbAll(
      `SELECT c.*, t.template_name,
              COUNT(cc.id) as contact_count,
              c.sent_count as credits_used
       FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [userId]
    );
  }

  static async findActiveByUserId(userId, limit = 5) {
    return await dbAll(
      `SELECT c.id,
              c.campaign_name,
              c.status,
              c.total_contacts,
              c.sent_count,
              c.failed_count,
              c.created_at,
              c.started_at,
              t.template_name
       FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       WHERE c.user_id = ? AND c.status IN ('pending', 'running')
       ORDER BY CASE c.status WHEN 'running' THEN 0 ELSE 1 END, c.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  static async findRunningWithUsers(limit = 50) {
    return await dbAll(
      `SELECT c.id,
              c.user_id,
              c.campaign_name,
              c.status,
              c.total_contacts,
              c.sent_count,
              c.failed_count,
              c.started_at,
              u.name as user_name,
              u.email as user_email
       FROM campaigns c
       JOIN users u ON c.user_id = u.id
       WHERE c.status = 'running'
       ORDER BY c.started_at DESC, c.created_at DESC
       LIMIT ?`,
      [limit]
    );
  }

  static async findById(id, userId) {
    return await dbGet(
      `SELECT c.*, t.template_name, t.message as template_message,
              t.media_type as template_media_type,
              t.media_path as template_media_path,
              t.media_mime as template_media_mime,
              t.media_name as template_media_name,
              t.buttons_json as template_buttons_json
       FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       WHERE c.id = ? AND c.user_id = ?`,
      [id, userId]
    );
  }

  static async updateStatus(id, status) {
    let sql = 'UPDATE campaigns SET status = ?';
    const params = [status];

    if (status === 'running') {
      sql += ', started_at = CURRENT_TIMESTAMP';
    } else if (status === 'completed') {
      sql += ', completed_at = CURRENT_TIMESTAMP';
    }

    sql += ' WHERE id = ?';
    params.push(id);

    await dbRun(sql, params);
  }

  static async updateCounts(id, sentCount, failedCount) {
    await dbRun(
      'UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?',
      [sentCount, failedCount, id]
    );
  }

  static async getCampaignContacts(campaignId) {
    return await dbAll(
      `SELECT cc.*, c.name, c.phone
       FROM campaign_contacts cc
       JOIN contacts c ON cc.contact_id = c.id
       WHERE cc.campaign_id = ?
       ORDER BY cc.id ASC`,
      [campaignId]
    );
  }

  static async updateContactStatus(id, status, errorMessage = null) {
    await dbRun(
      'UPDATE campaign_contacts SET status = ?, sent_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?',
      [status, errorMessage, id]
    );
  }

  static async normalizeRunningToPending() {
    const result = await dbRun(
      "UPDATE campaigns SET status = 'pending' WHERE status = 'running'"
    );
    return result.changes || 0;
  }

  static async delete(id, userId) {
    const result = await dbRun(
      'DELETE FROM campaigns WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes > 0;
  }

  static async logMessage(userId, campaignId, phone, name, message, status) {
    await dbRun(
      'INSERT INTO message_logs (user_id, campaign_id, contact_phone, contact_name, message, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, campaignId, phone, name, message, status]
    );
  }

  static async getCreditUsageByUserId(userId, limit = 50) {
    return dbAll(
      `SELECT c.id,
              c.campaign_name,
              c.status,
              c.total_contacts,
              c.sent_count,
              c.failed_count,
              c.created_at,
              c.completed_at,
              c.sent_count as credits_used
       FROM campaigns c
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }
}

module.exports = CampaignModel;