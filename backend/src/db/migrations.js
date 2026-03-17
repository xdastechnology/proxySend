require('dotenv').config();

const { initDb, getPool, query } = require('./index');
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
  {
    version: 3,
    name: 'seller_tenancy_and_commission_snapshots',
    up: async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS sellers (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          password_hash TEXT NOT NULL,
          commission_pct REAL NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_sellers_active ON sellers(is_active)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_sellers_created ON sellers(created_at DESC)`);

      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
      await query(`CREATE INDEX IF NOT EXISTS idx_users_seller_id ON users(seller_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`);

      await query(`ALTER TABLE reference_codes ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL`);
      await query(`CREATE INDEX IF NOT EXISTS idx_reference_codes_seller_id ON reference_codes(seller_id)`);

      await query(`ALTER TABLE credit_requests ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL`);
      await query(`CREATE INDEX IF NOT EXISTS idx_credit_requests_seller_status ON credit_requests(seller_id, status, created_at DESC)`);

      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS price_per_message REAL`);
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS gross_amount REAL`);
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS admin_commission_amount REAL`);
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS seller_net_amount REAL`);
      await query(`CREATE INDEX IF NOT EXISTS idx_credit_transactions_seller_created ON credit_transactions(seller_id, created_at DESC)`);

      await query(`UPDATE users SET is_active = TRUE WHERE is_active IS NULL`);
    },
  },
  {
    version: 4,
    name: 'seller_settlement_requests',
    up: async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS seller_settlements (
          id SERIAL PRIMARY KEY,
          seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
          from_date DATE NOT NULL,
          to_date DATE NOT NULL,
          due_amount REAL NOT NULL DEFAULT 0,
          paid_amount REAL NOT NULL DEFAULT 0,
          payment_reference TEXT,
          note TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          admin_note TEXT,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (status IN ('pending', 'confirmed', 'rejected')),
          CHECK (to_date >= from_date)
        )
      `);

      await query(`CREATE INDEX IF NOT EXISTS idx_seller_settlements_seller_created ON seller_settlements(seller_id, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_seller_settlements_status_created ON seller_settlements(status, created_at DESC)`);
    },
  },
  {
    version: 5,
    name: 'transaction_settlement_status',
    up: async () => {
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'pending'`);
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ`);
      await query(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS settlement_note TEXT`);

      await query(`
        UPDATE credit_transactions
        SET settlement_status = 'pending'
        WHERE settlement_status IS NULL
      `);

      await query(`CREATE INDEX IF NOT EXISTS idx_credit_transactions_seller_settlement_created ON credit_transactions(seller_id, settlement_status, created_at DESC)`);
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

if (require.main === module) {
  (async () => {
    try {
      initDb();
      await runMigrations();
      logger.info('Migrations completed');
      await getPool().end();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Migrations failed');
      try {
        await getPool().end();
      } catch {}
      process.exit(1);
    }
  })();
}
