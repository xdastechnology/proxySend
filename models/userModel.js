// models/userModel.js
const { dbRun, dbGet, dbAll } = require('../config/database');
const { publishUserUpdate, publishAdminUpdate } = require('../services/realtimeService');

class UserModel {
  static normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  static async findByEmail(email) {
    return await dbGet('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findByPhone(phone) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) return null;
    return dbGet('SELECT * FROM users WHERE phone = ?', [normalizedPhone]);
  }

  static async findByEmailOrPhone(identifier) {
    const raw = String(identifier || '').trim();
    if (!raw) return null;

    const normalizedEmail = raw.toLowerCase();
    if (normalizedEmail.includes('@')) {
      return this.findByEmail(normalizedEmail);
    }

    return this.findByPhone(raw);
  }

  static async findById(id) {
    return await dbGet('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async create({
    name,
    email,
    phone,
    password,
    referenceCodeId = null,
    referenceCode = null,
  }) {
    const normalizedPhone = this.normalizePhone(phone);
    const result = await dbRun(
      `INSERT INTO users (
        name,
        email,
        phone,
        password,
        credits,
        reference_code_id,
        reference_code
      ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [name, email, normalizedPhone, password, referenceCodeId, referenceCode]
    );
    return result.lastID;
  }

  static async updateCredits(userId, creditsToAdd) {
    await dbRun(
      'UPDATE users SET credits = credits + ? WHERE id = ?',
      [creditsToAdd, userId]
    );

    publishUserUpdate(userId, 'credits_updated', {
      source: 'admin_topup',
      creditsAdded: Number(creditsToAdd) || 0,
    });
    publishAdminUpdate('credits_updated', {
      userId: Number(userId),
      source: 'admin_topup',
      creditsAdded: Number(creditsToAdd) || 0,
    });
  }

  static async deductCredit(userId) {
    const result = await dbRun(
      'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0',
      [userId]
    );

    if (result.changes > 0) {
      publishUserUpdate(userId, 'credits_updated', { source: 'campaign_send', delta: -1 });
      publishAdminUpdate('credits_updated', {
        userId: Number(userId),
        source: 'campaign_send',
        delta: -1,
      });
    }

    return result.changes > 0;
  }

  static async updateWhatsAppStatus(userId, status) {
    await dbRun(
      'UPDATE users SET whatsapp_connected = ? WHERE id = ?',
      [status ? 1 : 0, userId]
    );
  }

  static async getAllUsers() {
    return await dbAll(
      `SELECT u.id,
              u.name,
              u.email,
              u.phone,
              u.credits,
              u.whatsapp_connected,
              u.created_at,
              u.reference_code,
              rc.price_inr as reference_price_inr,
              rc.marketing_message as reference_message,
              rc.code as reference_code_active
       FROM users u
       LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
       ORDER BY u.created_at DESC`
    );
  }

  static async getDashboardStats(userId) {
    const totalContacts = await dbGet(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = ?',
      [userId]
    );
    const totalTemplates = await dbGet(
      'SELECT COUNT(*) as count FROM templates WHERE user_id = ?',
      [userId]
    );
    const activeCampaigns = await dbGet(
      "SELECT COUNT(*) as count FROM campaigns WHERE user_id = ? AND status IN ('pending', 'running')",
      [userId]
    );
    const messagesSent = await dbGet(
      'SELECT COUNT(*) as count FROM message_logs WHERE user_id = ?',
      [userId]
    );
    const user = await dbGet(
      'SELECT credits FROM users WHERE id = ?',
      [userId]
    );

    return {
      totalContacts: totalContacts ? totalContacts.count : 0,
      totalTemplates: totalTemplates ? totalTemplates.count : 0,
      activeCampaigns: activeCampaigns ? activeCampaigns.count : 0,
      messagesSent: messagesSent ? messagesSent.count : 0,
      credits: user ? user.credits : 0,
    };
  }
}

module.exports = UserModel;