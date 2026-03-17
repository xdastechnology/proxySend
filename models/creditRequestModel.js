const { dbRun, dbGet, dbAll } = require('../config/database');

class CreditRequestModel {
  static async create({ userId, requestedCredits, requestNote, referenceCodeId = null, priceInr = null }) {
    const result = await dbRun(
      `INSERT INTO credit_requests (
        user_id,
        requested_credits,
        request_note,
        reference_code_id,
        price_inr
      ) VALUES (?, ?, ?, ?, ?)`,
      [userId, requestedCredits, requestNote || null, referenceCodeId, priceInr]
    );
    return result.lastID;
  }

  static async findById(id) {
    return dbGet('SELECT * FROM credit_requests WHERE id = ?', [id]);
  }

  static async findByUserId(userId, limit = 30) {
    return dbAll(
      `SELECT cr.*, rc.code as reference_code, rc.price_inr as reference_price_per_message
       FROM credit_requests cr
       LEFT JOIN reference_codes rc ON rc.id = cr.reference_code_id
       WHERE cr.user_id = ?
       ORDER BY cr.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  static async findPendingWithUsers(limit = 50) {
    return dbAll(
      `SELECT cr.*, u.name, u.email, rc.code as reference_code, rc.price_inr as reference_price_per_message
       FROM credit_requests cr
       JOIN users u ON cr.user_id = u.id
       LEFT JOIN reference_codes rc ON rc.id = cr.reference_code_id
       WHERE cr.status = 'pending'
       ORDER BY cr.created_at ASC
       LIMIT ?`,
      [limit]
    );
  }

  static async updateStatus({ id, status, adminNote = null, approvedCredits = 0 }) {
    const result = await dbRun(
      `UPDATE credit_requests
       SET status = ?,
           admin_note = ?,
           approved_credits = ?,
           resolved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, adminNote, approvedCredits, id]
    );

    return result.changes > 0;
  }
}

module.exports = CreditRequestModel;
