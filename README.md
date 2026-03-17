# ProxySend - WhatsApp Messaging Automation

Smart messaging automation platform built with Node.js, Express, Baileys, and Turso (libSQL).

## Requirements

- Node.js 18+
- A Turso database URL and auth token

## Environment

Configure these variables in `.env`:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace_with_secure_session_secret
ADMIN_PASSWORD=replace_with_admin_password
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token
```

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Persistence Notes

- Application data is stored in Turso.
- Express login sessions are stored in Turso (`app_sessions`).
- Baileys auth state is stored in Turso (`wa_auth_creds`, `wa_auth_keys`) and no longer depends on local session JSON files during runtime.

## Scripts

- `npm start` - start server
- `npm run dev` - start with nodemon

made some changes
