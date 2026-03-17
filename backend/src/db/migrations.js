const { query } = require('./index');
const logger = require('../utils/logger');

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS reference_codes (
          id SERIAL PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          inr_per_message REAL NOT NULL DEFAULT 0,
          marketing_message TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_reference_codes_code ON reference_codes(code)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_reference_codes_active ON reference_codes(is_active)`);

      await query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          reference_code_id INTEGER REFERENCES reference_codes(id),
          credits INTEGER NOT NULL DEFAULT 0,
          wa_status TEXT NOT NULL DEFAULT 'disconnected',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);

      await query(`
        CREATE TABLE IF NOT EXISTS contacts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          gender TEXT NOT NULL DEFAULT 'unspecified',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, phone)
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)`);

      await query(`
        CREATE TABLE IF NOT EXISTS templates (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          template_name TEXT NOT NULL,
          message TEXT,
          media_path TEXT,
          media_type TEXT,
          media_mime TEXT,
          media_original_name TEXT,
          buttons TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id)`);

      await query(`
        CREATE TABLE IF NOT EXISTS campaigns (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
          campaign_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          total_contacts INTEGER NOT NULL DEFAULT 0,
          sent_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)`);

      await query(`
        CREATE TABLE IF NOT EXISTS campaign_contacts (
          id SERIAL PRIMARY KEY,
          campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          error_note TEXT,
          sent_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_cc_campaign_id ON campaign_contacts(campaign_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_cc_contact_id ON campaign_contacts(contact_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_cc_status ON campaign_contacts(status)`);

      await query(`
        CREATE TABLE IF NOT EXISTS credit_transactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount INTEGER NOT NULL,
          type TEXT NOT NULL,
          note TEXT,
          campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON credit_transactions(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_transactions_type ON credit_transactions(type)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_transactions_created ON credit_transactions(created_at)`);

      await query(`
        CREATE TABLE IF NOT EXISTS credit_requests (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          requested_credits INTEGER NOT NULL,
          approved_credits INTEGER,
          status TEXT NOT NULL DEFAULT 'pending',
          note TEXT,
          admin_note TEXT,
          inr_per_message REAL,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_credit_requests_user_id ON credit_requests(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON credit_requests(status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_credit_requests_created ON credit_requests(created_at)`);

      await query(`
        CREATE TABLE IF NOT EXISTS message_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
          contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
          phone TEXT NOT NULL,
          status TEXT NOT NULL,
          error TEXT,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_message_logs_user_id ON message_logs(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_id ON message_logs(campaign_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_message_logs_sent_at ON message_logs(sent_at)`);

      await query(`
        CREATE TABLE IF NOT EXISTS wa_auth_creds (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          creds_json TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_wa_auth_creds_user_id ON wa_auth_creds(user_id)`);

      await query(`
        CREATE TABLE IF NOT EXISTS wa_auth_keys (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key_type TEXT NOT NULL,
          key_id TEXT NOT NULL,
          key_json TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, key_type, key_id)
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_user ON wa_auth_keys(user_id, key_type, key_id)`);
    },
  },
  {
    version: 2,
    name: 'query_performance_indexes',
    up: async () => {
      await query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_created_desc ON contacts(user_id, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_templates_user_created_desc ON templates(user_id, created_at DESC)`);
    },
  },
];

async function runMigrations() {
  // Ensure migrations table exists
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows: ran } = await query('SELECT version FROM migrations');
  const ranVersions = ran.map((r) => r.version);

  for (const migration of migrations) {
    if (ranVersions.includes(migration.version)) {
      logger.debug({ version: migration.version }, 'Migration already ran');
      continue;
    }

    logger.info({ version: migration.version, name: migration.name }, 'Running migration');
    await migration.up();
    await query('INSERT INTO migrations (version, name) VALUES ($1, $2)', [
      migration.version,
      migration.name,
    ]);
    logger.info({ version: migration.version }, 'Migration completed');
  }
}

module.exports = { runMigrations };
