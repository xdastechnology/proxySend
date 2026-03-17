const { dbRun, dbGet, dbAll } = require('../config/database');

class ReferenceCodeModel {
  static normalizeCode(code) {
    return String(code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  static async create({ code, priceInr, marketingMessage, isActive = true }) {
    const normalizedCode = this.normalizeCode(code);
    const result = await dbRun(
      `INSERT INTO reference_codes (code, price_inr, marketing_message, is_active)
       VALUES (?, ?, ?, ?)`,
      [normalizedCode, priceInr, marketingMessage || null, isActive ? 1 : 0]
    );
    return result.lastID;
  }

  static async findByCode(code) {
    const normalizedCode = this.normalizeCode(code);
    return dbGet('SELECT * FROM reference_codes WHERE code = ?', [normalizedCode]);
  }

  static async findActiveByCode(code) {
    const normalizedCode = this.normalizeCode(code);
    return dbGet('SELECT * FROM reference_codes WHERE code = ? AND is_active = 1', [normalizedCode]);
  }

  static async findById(id) {
    return dbGet('SELECT * FROM reference_codes WHERE id = ?', [id]);
  }

  static async getAllWithUserCounts() {
    return dbAll(
      `SELECT rc.*, COUNT(u.id) as users_count
       FROM reference_codes rc
       LEFT JOIN users u ON u.reference_code_id = rc.id
       GROUP BY rc.id
       ORDER BY rc.created_at DESC`
    );
  }

  static async setActive(id, isActive) {
    const result = await dbRun(
      'UPDATE reference_codes SET is_active = ? WHERE id = ?',
      [isActive ? 1 : 0, id]
    );
    return result.changes > 0;
  }
}

module.exports = ReferenceCodeModel;
