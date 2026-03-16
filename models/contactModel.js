// models/contactModel.js
const { dbRun, dbGet, dbAll } = require('../config/database');

class ContactModel {
  static async create({ userId, name, phone, email = null, gender = 'unspecified' }) {
    try {
      const result = await dbRun(
        'INSERT INTO contacts (user_id, name, phone, email, gender) VALUES (?, ?, ?, ?, ?)',
        [userId, name, phone, email, gender]
      );
      return { success: true, id: result.lastID };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'Contact with this phone number already exists' };
      }
      throw err;
    }
  }

  static async findByUserId(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const contacts = await dbAll(
      'SELECT * FROM contacts WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    const totalRow = await dbGet(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = ?',
      [userId]
    );
    return { contacts, total: totalRow ? totalRow.count : 0 };
  }

  static async findAllByUserId(userId) {
    return await dbAll(
      'SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC',
      [userId]
    );
  }

  static async findById(id, userId) {
    return await dbGet(
      'SELECT * FROM contacts WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  static async delete(id, userId) {
    const result = await dbRun(
      'DELETE FROM contacts WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes > 0;
  }

  static async update(id, userId, { name, phone, email = null, gender = 'unspecified' }) {
    try {
      await dbRun(
        'UPDATE contacts SET name = ?, phone = ?, email = ?, gender = ? WHERE id = ? AND user_id = ?',
        [name, phone, email, gender, id, userId]
      );
      return { success: true };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'Contact with this phone number already exists' };
      }
      throw err;
    }
  }

  static async bulkInsert(userId, contacts) {
    let inserted = 0;
    for (const contact of contacts) {
      try {
        const result = await dbRun(
          'INSERT OR IGNORE INTO contacts (user_id, name, phone, email, gender) VALUES (?, ?, ?, ?, ?)',
          [
            userId,
            contact.name,
            contact.phone,
            contact.email || null,
            contact.gender || 'unspecified',
          ]
        );
        inserted += result.changes;
      } catch (err) {
        // Skip duplicates silently
      }
    }
    return inserted;
  }

  static async search(userId, query) {
    return await dbAll(
      'SELECT * FROM contacts WHERE user_id = ? AND (name LIKE ? OR phone LIKE ? OR COALESCE(email, \"\") LIKE ? OR COALESCE(gender, \"\") LIKE ?) ORDER BY name ASC LIMIT 50',
      [userId, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]
    );
  }
}

module.exports = ContactModel;