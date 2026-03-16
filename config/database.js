// config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'proxysend.db');

// Ensure directories exist
[
  DATA_DIR,
  path.join(__dirname, '..', 'sessions'),
  path.join(__dirname, '..', 'logs'),
  path.join(__dirname, '..', 'data', 'uploads'),
  path.join(__dirname, '..', 'data', 'uploads', 'template-media'),
].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let db;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Database connection error: ' + err.message);
        process.exit(1);
      }
    });
    db.serialize(() => {
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA foreign_keys = ON');
    });
  }
  return db;
}

// Promise wrappers for cleaner async usage
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureContactColumns() {
  const columns = await dbAll('PRAGMA table_info(contacts)');
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('email')) {
    await dbRun('ALTER TABLE contacts ADD COLUMN email TEXT');
  }

  if (!names.has('gender')) {
    await dbRun("ALTER TABLE contacts ADD COLUMN gender TEXT DEFAULT 'unspecified'");
  }

  await dbRun(
    "UPDATE contacts SET gender = 'unspecified' WHERE gender IS NULL OR TRIM(gender) = ''"
  );
}

async function ensureTemplateColumns() {
  const columns = await dbAll('PRAGMA table_info(templates)');
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('media_type')) {
    await dbRun('ALTER TABLE templates ADD COLUMN media_type TEXT');
  }

  if (!names.has('media_path')) {
    await dbRun('ALTER TABLE templates ADD COLUMN media_path TEXT');
  }

  if (!names.has('media_mime')) {
    await dbRun('ALTER TABLE templates ADD COLUMN media_mime TEXT');
  }

  if (!names.has('media_name')) {
    await dbRun('ALTER TABLE templates ADD COLUMN media_name TEXT');
  }

  if (!names.has('buttons_json')) {
    await dbRun('ALTER TABLE templates ADD COLUMN buttons_json TEXT');
  }
}

async function initializeDatabase() {
  logger.info('Initializing database...');

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      credits INTEGER DEFAULT 0,
      whatsapp_connected INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      gender TEXT DEFAULT 'unspecified',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, phone)
    )
  `);

  await ensureContactColumns();

  await dbRun(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_name TEXT NOT NULL,
      message TEXT NOT NULL,
      media_type TEXT,
      media_path TEXT,
      media_mime TEXT,
      media_name TEXT,
      buttons_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await ensureTemplateColumns();

  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      campaign_name TEXT NOT NULL,
      template_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      total_contacts INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at DATETIME,
      error_message TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credits_added INTEGER NOT NULL,
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      campaign_id INTEGER,
      contact_phone TEXT NOT NULL,
      contact_name TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  logger.info('Database initialized successfully');
}

module.exports = { getDatabase, initializeDatabase, dbRun, dbGet, dbAll };