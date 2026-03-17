require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT key_type, key_id FROM wa_auth_keys WHERE key_type LIKE '%app-state%'").then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(console.error);
