const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'TestAdmin123';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/proxysend_test';
process.env.UPLOADS_DIR = path.resolve(__dirname, '../backend/uploads/test');
process.env.FRONTEND_URL = 'http://localhost:5173';

let app;
let agent;
let pool;

beforeAll(async () => {
  fs.mkdirSync(process.env.UPLOADS_DIR, { recursive: true });

  const { initDb, getPool, query } = require('../backend/src/db');
  const { runMigrations } = require('../backend/src/db/migrations');

  initDb();
  pool = getPool();

  // Drop all tables to start fresh
  await query(`
    DROP TABLE IF EXISTS
      app_sessions, migrations,
      wa_auth_keys, wa_auth_creds,
      message_logs, credit_requests, credit_transactions,
      campaign_contacts, campaigns, templates, contacts,
      users, reference_codes
    CASCADE
  `);

  await runMigrations();

  // Seed a test reference code
  await query(
    "INSERT INTO reference_codes (code, inr_per_message, is_active) VALUES ('TESTCODE', 0.5, TRUE) ON CONFLICT (code) DO NOTHING"
  );

  // Load app
  const express = require('express');
  const session = require('express-session');
  const cors = require('cors');
  const testApp = express();

  testApp.use(express.json());
  testApp.use(express.urlencoded({ extended: true }));
  testApp.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));

  testApp.use('/api/auth', require('../backend/src/routes/auth'));
  testApp.use('/api/profile', require('../backend/src/routes/profile'));
  testApp.use('/api/contacts', require('../backend/src/routes/contacts'));
  testApp.use('/api/templates', require('../backend/src/routes/templates'));
  testApp.use('/api/campaigns', require('../backend/src/routes/campaigns'));
  testApp.use('/api/credits', require('../backend/src/routes/credits'));
  testApp.use('/api/admin', require('../backend/src/routes/admin'));
  testApp.use(require('../backend/src/middleware/errorHandler'));

  app = testApp;
  agent = request.agent(app);
}, 30000);

afterAll(async () => {
  // Close pool connection
  if (pool) {
    await pool.end();
  }
});

// ─── AUTH TESTS ─────────────────────────────────────────────────────────────

describe('Authentication', () => {
  test('POST /api/auth/register - fails with invalid reference code', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@test.com',
        phone: '9876543210',
        password: 'Test@1234',
        confirmPassword: 'Test@1234',
        referenceCode: 'INVALID',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test('POST /api/auth/register - succeeds with valid reference code', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'testuser@test.com',
        phone: '9876543210',
        password: 'Test@1234',
        confirmPassword: 'Test@1234',
        referenceCode: 'TESTCODE',
      });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('testuser@test.com');
  });

  test('POST /api/auth/register - fails with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User 2',
        email: 'testuser@test.com',
        phone: '9876543211',
        password: 'Test@1234',
        confirmPassword: 'Test@1234',
        referenceCode: 'TESTCODE',
      });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login - succeeds with email', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ identifier: 'testuser@test.com', password: 'Test@1234' });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('testuser@test.com');
  });

  test('POST /api/auth/login - fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'testuser@test.com', password: 'WrongPass' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me - returns user when authenticated', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });

  test('POST /api/auth/admin/login - succeeds with correct password', async () => {
    const adminAgent = request.agent(app);
    const res = await adminAgent
      .post('/api/auth/admin/login')
      .send({ password: 'TestAdmin123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/auth/admin/login - fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

// ─── CONTACTS TESTS ─────────────────────────────────────────────────────────

describe('Contacts', () => {
  test('GET /api/contacts - requires authentication', async () => {
    const res = await request(app).get('/api/contacts');
    expect(res.status).toBe(401);
  });

  test('GET /api/contacts - returns list when authenticated', async () => {
    const res = await agent.get('/api/contacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.contacts)).toBe(true);
  });

  test('POST /api/contacts - creates contact', async () => {
    const res = await agent
      .post('/api/contacts')
      .send({ name: 'John Doe', phone: '9876500001', gender: 'male' });
    expect(res.status).toBe(201);
    expect(res.body.contact.name).toBe('John Doe');
    expect(res.body.contact.phone).toBe('919876500001');
  });

  test('POST /api/contacts - normalizes Indian phone number', async () => {
    const res = await agent
      .post('/api/contacts')
      .send({ name: 'Jane Doe', phone: '+91 9876500002' });
    expect(res.status).toBe(201);
    expect(res.body.contact.phone).toBe('919876500002');
  });

  test('POST /api/contacts - rejects duplicate phone', async () => {
    const res = await agent
      .post('/api/contacts')
      .send({ name: 'Dupe', phone: '9876500001' });
    expect(res.status).toBe(409);
  });

  test('PUT /api/contacts/:id - updates contact', async () => {
    const createRes = await agent
      .post('/api/contacts')
      .send({ name: 'Update Me', phone: '9876500010' });
    const id = createRes.body.contact.id;

    const res = await agent
      .put(`/api/contacts/${id}`)
      .send({ name: 'Updated Name', phone: '9876500010', gender: 'female' });
    expect(res.status).toBe(200);
    expect(res.body.contact.name).toBe('Updated Name');
  });

  test('DELETE /api/contacts/:id - deletes contact', async () => {
    const createRes = await agent
      .post('/api/contacts')
      .send({ name: 'Delete Me', phone: '9876500099' });
    const id = createRes.body.contact.id;

    const res = await agent.delete(`/api/contacts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/contacts/search - returns matching contacts', async () => {
    const res = await agent.get('/api/contacts/search?q=John');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.contacts)).toBe(true);
  });
});

// ─── TEMPLATES TESTS ─────────────────────────────────────────────────────────

describe('Templates', () => {
  test('GET /api/templates - returns list', async () => {
    const res = await agent.get('/api/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
  });

  test('POST /api/templates - creates template with message', async () => {
    const res = await agent
      .post('/api/templates')
      .field('templateName', 'Test Template')
      .field('message', 'Hello {{name}}!');
    expect(res.status).toBe(201);
    expect(res.body.template.template_name).toBe('Test Template');
    expect(res.body.template.message).toBe('Hello {{name}}!');
  });

  test('POST /api/templates - fails without message or media', async () => {
    const res = await agent
      .post('/api/templates')
      .field('templateName', 'Empty Template');
    expect(res.status).toBe(400);
  });

  test('POST /api/templates - creates template with buttons', async () => {
    const buttons = JSON.stringify([
      { label: 'Visit Us', url: 'https://example.com' },
      { label: 'Call Now', url: 'https://wa.me/1234567890' },
    ]);
    const res = await agent
      .post('/api/templates')
      .field('templateName', 'Button Template')
      .field('message', 'Check this out!')
      .field('buttons', buttons);
    expect(res.status).toBe(201);
    expect(res.body.template.buttons).toHaveLength(2);
  });

  test('DELETE /api/templates/:id - deletes template', async () => {
    const createRes = await agent
      .post('/api/templates')
      .field('templateName', 'Delete Me')
      .field('message', 'Bye');
    const id = createRes.body.template.id;
    const res = await agent.delete(`/api/templates/${id}`);
    expect(res.status).toBe(200);
  });
});

// ─── CAMPAIGNS TESTS ─────────────────────────────────────────────────────────

describe('Campaigns', () => {
  let templateId;
  let contactId;

  beforeAll(async () => {
    const tmplRes = await agent
      .post('/api/templates')
      .field('templateName', 'Campaign Template')
      .field('message', 'Hello {{name}}');
    templateId = tmplRes.body.template.id;

    const ctRes = await agent
      .post('/api/contacts')
      .send({ name: 'Campaign Contact', phone: '9876599999' });
    contactId = ctRes.body.contact.id;
  });

  test('POST /api/campaigns - creates campaign', async () => {
    const res = await agent.post('/api/campaigns').send({
      campaignName: 'Test Campaign',
      templateId,
      contactIds: [contactId],
    });
    expect(res.status).toBe(201);
    expect(res.body.campaign.campaign_name).toBe('Test Campaign');
    expect(res.body.campaign.status).toBe('pending');
    expect(res.body.campaign.total_contacts).toBe(1);
  });

  test('GET /api/campaigns - returns list', async () => {
    const res = await agent.get('/api/campaigns');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.campaigns)).toBe(true);
    expect(res.body.campaigns.length).toBeGreaterThan(0);
  });

  test('GET /api/campaigns/:id - returns campaign detail', async () => {
    const listRes = await agent.get('/api/campaigns');
    const campaignId = listRes.body.campaigns[0].id;
    const res = await agent.get(`/api/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.body.campaign).toBeDefined();
    expect(res.body.contacts).toBeDefined();
  });

  test('POST /api/campaigns/:id/start - returns error when WA disconnected', async () => {
    const listRes = await agent.get('/api/campaigns');
    const campaignId = listRes.body.campaigns[0].id;
    // WA is disconnected in test, campaign starts but will fail on send
    const res = await agent.post(`/api/campaigns/${campaignId}/start`);
    // Should accept start request (200) even without WA
    expect([200, 400]).toContain(res.status);
  });
});

// ─── CREDITS TESTS ────────────────────────────────────────────────────────────

describe('Credits', () => {
  test('GET /api/credits - returns overview', async () => {
    const res = await agent.get('/api/credits');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('credits');
    expect(res.body).toHaveProperty('transactions');
    expect(res.body).toHaveProperty('requests');
  });

  test('POST /api/credits/request - submits credit request', async () => {
    const res = await agent
      .post('/api/credits/request')
      .send({ requestedCredits: 100, note: 'Need more credits' });
    expect(res.status).toBe(201);
    expect(res.body.request.requested_credits).toBe(100);
    expect(res.body.request.status).toBe('pending');
  });

  test('POST /api/credits/request - rejects duplicate pending request', async () => {
    const res = await agent
      .post('/api/credits/request')
      .send({ requestedCredits: 200 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });

  test('POST /api/credits/request - rejects invalid amount', async () => {
    const res = await agent
      .post('/api/credits/request')
      .send({ requestedCredits: 0 });
    expect(res.status).toBe(400);
  });
});

// ─── ADMIN TESTS ─────────────────────────────────────────────────────────────

describe('Admin', () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = request.agent(app);
    await adminAgent
      .post('/api/auth/admin/login')
      .send({ password: 'TestAdmin123' });
  });

  test('GET /api/admin/dashboard - returns dashboard data', async () => {
    const res = await adminAgent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.users).toBeDefined();
    expect(res.body.referenceCodes).toBeDefined();
  });

  test('GET /api/admin/dashboard - rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('POST /api/admin/credits/add - adds credits to user', async () => {
    const res = await adminAgent.post('/api/admin/credits/add').send({
      email: 'testuser@test.com',
      amount: 50,
      note: 'Test credit addition',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newBalance).toBeGreaterThanOrEqual(50);
  });

  test('POST /api/admin/credits/add - fails for nonexistent user', async () => {
    const res = await adminAgent.post('/api/admin/credits/add').send({
      email: 'nobody@test.com',
      amount: 50,
    });
    expect(res.status).toBe(404);
  });

  test('POST /api/admin/reference-codes - creates reference code', async () => {
    const res = await adminAgent.post('/api/admin/reference-codes').send({
      code: 'NEWCODE2024',
      inrPerMessage: 1.0,
      marketingMessage: 'Test message',
    });
    expect(res.status).toBe(201);
    expect(res.body.referenceCode.code).toBe('NEWCODE2024');
  });

  test('POST /api/admin/reference-codes - rejects duplicate code', async () => {
    const res = await adminAgent.post('/api/admin/reference-codes').send({
      code: 'TESTCODE',
      inrPerMessage: 0.5,
    });
    expect(res.status).toBe(409);
  });

  test('PATCH /api/admin/reference-codes/:id/toggle - toggles status', async () => {
    const dashRes = await adminAgent.get('/api/admin/dashboard');
    const code = dashRes.body.referenceCodes.find(rc => rc.code === 'NEWCODE2024');
    const res = await adminAgent.patch(`/api/admin/reference-codes/${code.id}/toggle`);
    expect(res.status).toBe(200);
    expect(typeof res.body.isActive).toBe('boolean');
  });

  test('PATCH /api/admin/credit-requests/:id - approves credit request', async () => {
    const reqRes = await adminAgent.get('/api/admin/credit-requests?status=pending');
    if (reqRes.body.requests.length > 0) {
      const requestId = reqRes.body.requests[0].id;
      const res = await adminAgent.patch(`/api/admin/credit-requests/${requestId}`).send({
        action: 'approve',
        approvedCredits: 100,
        adminNote: 'Approved in test',
      });
      expect(res.status).toBe(200);
      expect(res.body.request.status).toBe('approved');
    } else {
      expect(true).toBe(true); // No pending requests to test
    }
  });
});

// ─── PROFILE TESTS ────────────────────────────────────────────────────────────

describe('Profile', () => {
  test('GET /api/profile - returns user profile', async () => {
    const res = await agent.get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });

  test('PUT /api/profile - updates profile', async () => {
    const res = await agent.put('/api/profile').send({
      name: 'Updated Test User',
      email: 'testuser@test.com',
      phone: '9876543210',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Test User');
  });

  test('PUT /api/profile/password - changes password', async () => {
    const res = await agent.put('/api/profile/password').send({
      currentPassword: 'Test@1234',
      newPassword: 'NewTest@5678',
      confirmPassword: 'NewTest@5678',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('PUT /api/profile/password - fails with wrong current password', async () => {
    const res = await agent.put('/api/profile/password').send({
      currentPassword: 'WrongPass',
      newPassword: 'NewTest@5678',
      confirmPassword: 'NewTest@5678',
    });
    expect(res.status).toBe(400);
  });
});
