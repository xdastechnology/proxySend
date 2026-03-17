const session = require('express-session');
const { dbGet, dbRun } = require('./database');
const logger = require('./logger');

class TursoSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.tableName = options.tableName || 'app_sessions';
    this.defaultTtlMs = options.defaultTtlMs || 24 * 60 * 60 * 1000;
    this.cleanupCounter = 0;
    this.cleanupEvery = options.cleanupEvery || 100;
  }

  get(sid, callback) {
    this.#getInternal(sid)
      .then((sess) => callback(null, sess))
      .catch((err) => callback(err));
  }

  set(sid, sess, callback) {
    this.#setInternal(sid, sess)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  destroy(sid, callback) {
    this.#destroyInternal(sid)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, sess, callback) {
    this.#touchInternal(sid, sess)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  async #getInternal(sid) {
    const row = await dbGet(
      `SELECT sess FROM ${this.tableName} WHERE sid = ? AND expires_at > CURRENT_TIMESTAMP`,
      [sid]
    );

    if (!row || !row.sess) {
      return null;
    }

    try {
      return JSON.parse(row.sess);
    } catch (err) {
      logger.error(`Failed to parse session ${sid}: ${err.message}`);
      return null;
    }
  }

  async #setInternal(sid, sess) {
    const expiresAt = this.#resolveExpiry(sess);

    await dbRun(
      `INSERT INTO ${this.tableName} (sid, sess, expires_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(sid)
       DO UPDATE SET
         sess = excluded.sess,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [sid, JSON.stringify(sess), expiresAt]
    );

    this.cleanupCounter += 1;
    if (this.cleanupCounter >= this.cleanupEvery) {
      this.cleanupCounter = 0;
      await this.#cleanupExpired();
    }
  }

  async #destroyInternal(sid) {
    await dbRun(`DELETE FROM ${this.tableName} WHERE sid = ?`, [sid]);
  }

  async #touchInternal(sid, sess) {
    const expiresAt = this.#resolveExpiry(sess);
    await dbRun(
      `UPDATE ${this.tableName}
       SET expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE sid = ?`,
      [expiresAt, sid]
    );
  }

  async #cleanupExpired() {
    await dbRun(`DELETE FROM ${this.tableName} WHERE expires_at <= CURRENT_TIMESTAMP`);
  }

  #resolveExpiry(sess) {
    const expires = sess && sess.cookie && sess.cookie.expires;
    if (expires) {
      const date = new Date(expires);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return new Date(Date.now() + this.defaultTtlMs).toISOString();
  }
}

module.exports = TursoSessionStore;
