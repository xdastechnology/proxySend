const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');

[
  DATA_DIR,
  path.join(__dirname, '..', 'data', 'uploads'),
  path.join(__dirname, '..', 'data', 'uploads', 'template-media'),
  path.join(__dirname, '..', 'data', 'uploads', 'template-temp'),
].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let client;

function normalizeValue(value) {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (Number.isSafeInteger(asNumber)) {
      return asNumber;
    }
    return value.toString();
  }

  return value;
}

function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
}

function resultLastInsertId(result) {
  if (!result || result.lastInsertRowid == null) {
    return null;
  }

  return normalizeValue(result.lastInsertRowid);
}

function getDatabase() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required');
    }

    client = createClient({
      url,
      authToken,
      intMode: 'number',
    });
  }

  return client;
}

async function executeStatement(executor, sql, params = []) {
  return executor.execute({
    sql,
    args: params,
  });
}

async function dbRun(sql, params = []) {
  const result = await executeStatement(getDatabase(), sql, params);
  return {
    lastID: resultLastInsertId(result),
    changes: normalizeValue(result.rowsAffected || 0),
  };
}

async function dbGet(sql, params = []) {
  const result = await executeStatement(getDatabase(), sql, params);
  const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
  return row ? normalizeRow(row) : undefined;
}

async function dbAll(sql, params = []) {
  const result = await executeStatement(getDatabase(), sql, params);
  return (result.rows || []).map(normalizeRow);
}

async function dbTransaction(handler) {
  const tx = await getDatabase().transaction();

  const txApi = {
    run: async (sql, params = []) => {
      const result = await executeStatement(tx, sql, params);
      return {
        lastID: resultLastInsertId(result),
        changes: normalizeValue(result.rowsAffected || 0),
      };
    },
    get: async (sql, params = []) => {
      const result = await executeStatement(tx, sql, params);
      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      return row ? normalizeRow(row) : undefined;
    },
    all: async (sql, params = []) => {
      const result = await executeStatement(tx, sql, params);
      return (result.rows || []).map(normalizeRow);
    },
  };

  try {
    const output = await handler(txApi);
    await tx.commit();
    return output;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (rollbackErr) {
      logger.error(`Transaction rollback failed: ${rollbackErr.message}`);
    }
    throw err;
  }
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

async function ensureUserColumns() {
  const columns = await dbAll('PRAGMA table_info(users)');
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('phone')) {
    await dbRun('ALTER TABLE users ADD COLUMN phone TEXT');
  }

  if (!names.has('reference_code_id')) {
    await dbRun('ALTER TABLE users ADD COLUMN reference_code_id INTEGER');
  }

  if (!names.has('reference_code')) {
    await dbRun('ALTER TABLE users ADD COLUMN reference_code TEXT');
  }
}

async function ensureCreditTransactionColumns() {
  const columns = await dbAll('PRAGMA table_info(credit_transactions)');
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('source')) {
    await dbRun("ALTER TABLE credit_transactions ADD COLUMN source TEXT DEFAULT 'admin_manual'");
  }

  if (!names.has('request_id')) {
    await dbRun('ALTER TABLE credit_transactions ADD COLUMN request_id INTEGER');
  }

  if (!names.has('inr_amount')) {
    await dbRun('ALTER TABLE credit_transactions ADD COLUMN inr_amount REAL');
  }

  if (!names.has('reference_code_id')) {
    await dbRun('ALTER TABLE credit_transactions ADD COLUMN reference_code_id INTEGER');
  }

  await dbRun(
    "UPDATE credit_transactions SET source = 'admin_manual' WHERE source IS NULL OR TRIM(source) = ''"
  );
}

async function initializeDatabase() {
  logger.info('Initializing database...');

  await dbRun('PRAGMA foreign_keys = ON');

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      credits INTEGER DEFAULT 0,
      whatsapp_connected INTEGER DEFAULT 0,
      reference_code_id INTEGER,
      reference_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureUserColumns();

  await dbRun(`
    CREATE TABLE IF NOT EXISTS reference_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      price_inr REAL NOT NULL,
      marketing_message TEXT,
      is_active INTEGER DEFAULT 1,
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
      source TEXT DEFAULT 'admin_manual',
      request_id INTEGER,
      inr_amount REAL,
      reference_code_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await ensureCreditTransactionColumns();

  await dbRun(`
    CREATE TABLE IF NOT EXISTS credit_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      requested_credits INTEGER NOT NULL,
      request_note TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      approved_credits INTEGER DEFAULT 0,
      reference_code_id INTEGER,
      price_inr REAL,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS wa_auth_creds (
      user_id INTEGER PRIMARY KEY,
      creds_json TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS wa_auth_keys (
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, type, id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(
    'CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_user_type ON wa_auth_keys(user_id, type)'
  );

  await dbRun('CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires_at)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_reference_codes_code ON reference_codes(code)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_users_reference_code ON users(reference_code_id)');
  await dbRun(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND TRIM(phone) <> ''"
  );
  await dbRun('CREATE INDEX IF NOT EXISTS idx_credit_requests_user ON credit_requests(user_id, created_at DESC)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON credit_requests(status, created_at DESC)');

  logger.info('Database initialized successfully');
}

module.exports = {
  getDatabase,
  initializeDatabase,
  dbRun,
  dbGet,
  dbAll,
  dbTransaction,
};