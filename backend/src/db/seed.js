require('dotenv').config();
const { initDb, query } = require('./index');
const { runMigrations } = require('./migrations');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

async function seed() {
  await initDb();
  await runMigrations();

  // Create default reference code
  const { rows: existing } = await query(
    'SELECT id FROM reference_codes WHERE code = $1',
    ['PROXYSEND']
  );

  let refCodeId;
  if (existing.length === 0) {
    const { rows } = await query(
      'INSERT INTO reference_codes (code, inr_per_message, marketing_message, is_active) VALUES ($1, $2, $3, $4) RETURNING id',
      ['PROXYSEND', 0.5, 'Welcome to Proxy Send - The Professional WhatsApp Automation Platform', true]
    );
    refCodeId = rows[0].id;
    logger.info({ code: 'PROXYSEND' }, 'Created default reference code');
  } else {
    refCodeId = existing[0].id;
    logger.info('Default reference code already exists');
  }

  // Create demo user
  const { rows: existingUser } = await query(
    'SELECT id FROM users WHERE email = $1',
    ['demo@proxysend.com']
  );

  if (existingUser.length === 0) {
    const hash = await bcrypt.hash('Demo@1234', 12);
    await query(
      'INSERT INTO users (name, email, phone, password_hash, reference_code_id, credits) VALUES ($1, $2, $3, $4, $5, $6)',
      ['Demo User', 'demo@proxysend.com', '919000000001', hash, refCodeId, 100]
    );
    logger.info('Created demo user: demo@proxysend.com / Demo@1234');
  } else {
    logger.info('Demo user already exists');
  }

  logger.info('Seed completed');
  process.exit(0);
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
