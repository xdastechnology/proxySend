require('dotenv').config();
const { initDb, query } = require('./index');
const { runMigrations } = require('./migrations');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

async function seed() {
  await initDb();
  await runMigrations();

  // Create demo user
  const { rows: existingUser } = await query(
    'SELECT id FROM users WHERE email = $1',
    ['demo@feelaxo.com']
  );

  if (existingUser.length === 0) {
    const hash = await bcrypt.hash('Demo@1234', 12);
    await query(
      'INSERT INTO users (name, email, phone, password_hash, credits) VALUES ($1, $2, $3, $4, $5)',
      ['Demo User', 'demo@feelaxo.com', '919000000001', hash, 100]
    );
    logger.info('Created demo user: demo@feelaxo.com / Demo@1234');
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
