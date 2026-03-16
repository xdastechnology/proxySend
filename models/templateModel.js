// models/templateModel.js
const { dbRun, dbGet, dbAll } = require('../config/database');

class TemplateModel {
  static async create({ userId, templateName, message, mediaType = null, mediaPath = null, mediaMime = null, mediaName = null, buttonsJson = null }) {
    const result = await dbRun(
      'INSERT INTO templates (user_id, template_name, message, media_type, media_path, media_mime, media_name, buttons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, templateName, message, mediaType, mediaPath, mediaMime, mediaName, buttonsJson]
    );
    return result.lastID;
  }

  static async findByUserId(userId) {
    return await dbAll(
      'SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  static async findById(id, userId) {
    return await dbGet(
      'SELECT * FROM templates WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  static async update(id, userId, { templateName, message, mediaType = null, mediaPath = null, mediaMime = null, mediaName = null, buttonsJson = null }) {
    const result = await dbRun(
      'UPDATE templates SET template_name = ?, message = ?, media_type = ?, media_path = ?, media_mime = ?, media_name = ?, buttons_json = ? WHERE id = ? AND user_id = ?',
      [templateName, message, mediaType, mediaPath, mediaMime, mediaName, buttonsJson, id, userId]
    );
    return result.changes > 0;
  }

  static async delete(id, userId) {
    const result = await dbRun(
      'DELETE FROM templates WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes > 0;
  }

  static processTemplate(message, variables) {
    let processed = message;
    for (const [key, value] of Object.entries(variables)) {
      processed = processed.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return processed;
  }
}

module.exports = TemplateModel;