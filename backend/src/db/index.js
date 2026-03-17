const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

let pool = null;

function initDb() {
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
  });

  logger.info('PostgreSQL pool initialized');
  return pool;
}

function getPool() {
  if (!pool) throw new Error('Database not initialized. Call initDb() first.');
  return pool;
}

/**
 * Run a parameterized query against the pool.
 * @param {string} text  SQL text with $1, $2, ... placeholders
 * @param {Array}  params  Array of parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  const duration = Date.now() - start;
  if (config.nodeEnv === 'development') {
    logger.trace({ query: text, duration, rows: res.rowCount }, 'SQL');
  }
  return res;
}

// Backwards-compat alias so callers that import { getDb } still work
// during the transition.  New code should use query() directly.
const getDb = getPool;

module.exports = { initDb, getPool, getDb, query };
