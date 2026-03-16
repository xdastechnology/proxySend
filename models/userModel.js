// models/userModel.js
const { dbRun, dbGet, dbAll } = require('../config/database');

class UserModel {
  static async findByEmail(email) {
    return await dbGet('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findById(id) {
    return await dbGet('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async create({ name, email, password }) {
    const result = await dbRun(
      'INSERT INTO users (name, email, password, credits) VALUES (?, ?, ?, 0)',
      [name, email, password]
    );
    return result.lastID;
  }

  static async updateCredits(userId, creditsToAdd) {
    await dbRun(
      'UPDATE users SET credits = credits + ? WHERE id = ?',
      [creditsToAdd, userId]
    );
  }

  static async deductCredit(userId) {
    const result = await dbRun(
      'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0',
      [userId]
    );
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
      'SELECT id, name, email, credits, whatsapp_connected, created_at FROM users ORDER BY created_at DESC'
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