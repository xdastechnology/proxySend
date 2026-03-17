const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  initAuthCreds,
  BufferJSON,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { query } = require('../db');
const logger = require('../utils/logger');
const sseService = require('./sse');

// Map of userId -> { socket, status, qr }
const connections = new Map();
// Map of userId -> Promise for in-flight connect operation
const connectInFlight = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// PostgreSQL-based auth state for Baileys
function usePgAuthState(userId) {
  const readData = async () => {
    const { rows } = await query(
      'SELECT creds_json FROM wa_auth_creds WHERE user_id = $1',
      [userId]
    );
    if (!rows.length) return null;
    try {
      return JSON.parse(rows[0].creds_json, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeData = async (data) => {
    const json = JSON.stringify(data, BufferJSON.replacer);
    await query(
      `INSERT INTO wa_auth_creds (user_id, creds_json, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         creds_json = EXCLUDED.creds_json,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, json]
    );
  };

  const readKey = async (type, id) => {
    const { rows } = await query(
      'SELECT key_json FROM wa_auth_keys WHERE user_id = $1 AND key_type = $2 AND key_id = $3',
      [userId, type, id]
    );
    if (!rows.length) return null;
    try {
      return JSON.parse(rows[0].key_json, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeKey = async (type, id, data) => {
    const json = JSON.stringify(data, BufferJSON.replacer);
    await query(
      `INSERT INTO wa_auth_keys (user_id, key_type, key_id, key_json, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, key_type, key_id) DO UPDATE SET
         key_json = EXCLUDED.key_json,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, type, id, json]
    );
  };

  const removeKey = async (type, id) => {
    await query(
      'DELETE FROM wa_auth_keys WHERE user_id = $1 AND key_type = $2 AND key_id = $3',
      [userId, type, id]
    );
  };

  const buildState = async () => {
    let creds = await readData();
    if (!creds) {
      creds = initAuthCreds();
    }

    const state = {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const val = await readKey(type, id);
            if (val) data[id] = val;
          }
          return data;
        },
        set: async (data) => {
          for (const [type, typeData] of Object.entries(data)) {
            for (const [id, value] of Object.entries(typeData)) {
              if (value) {
                await writeKey(type, id, value);
              } else {
                await removeKey(type, id);
              }
            }
          }
        },
      },
    };

    const saveCreds = async () => writeData(state.creds);

    return { state, saveCreds };
  };

  return buildState;
}

async function updateUserWaStatus(userId, status) {
  try {
    await query(
      'UPDATE users SET wa_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, userId]
    );
  } catch (err) {
    logger.error({ err, userId, status }, 'Failed to update WA status');
  }
}

async function connectWhatsApp(userId) {
  const existing = connections.get(userId);
  if (existing && ['connected', 'connecting', 'qr_ready'].includes(existing.status)) {
    return existing;
  }

  if (connectInFlight.has(userId)) {
    return connectInFlight.get(userId);
  }

  const connectPromise = (async () => {
    const stale = connections.get(userId);
    if (stale) {
      try { stale.socket?.end?.(); } catch {}
      connections.delete(userId);
    }

    const conn = {
      status: 'connecting',
      qr: null,
      socket: null,
    };
    connections.set(userId, conn);
    await updateUserWaStatus(userId, 'connecting');
    sseService.broadcastToUser(userId, 'wa_status', { status: 'connecting' });

    try {
      const { version } = await fetchLatestBaileysVersion();
      const buildState = usePgAuthState(userId);
      const { state, saveCreds } = await buildState();

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger: logger.child({ component: 'baileys', userId }, { level: 'warn' }),
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 2000,
        maxMsgRetryCount: 2,
        browser: ['Proxy Send', 'Chrome', '10.0'],
      });

      conn.socket = socket;

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', async (update) => {
        // Ignore events from stale/replaced sockets.
        if (connections.get(userId)?.socket !== socket) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const QRCode = require('qrcode');
          try {
            const qrDataUrl = await QRCode.toDataURL(qr);
            conn.qr = qrDataUrl;
            conn.status = 'qr_ready';
            await updateUserWaStatus(userId, 'qr_ready');
            sseService.broadcastToUser(userId, 'wa_status', { status: 'qr_ready', qr: qrDataUrl });
            sseService.broadcastToAdmins('users_update', { userId, wa_status: 'qr_ready' });
          } catch (err) {
            logger.error({ err }, 'QR generation failed');
          }
        }

        if (connection === 'open') {
          conn.status = 'connected';
          conn.qr = null;
          await updateUserWaStatus(userId, 'connected');
          sseService.broadcastToUser(userId, 'wa_status', { status: 'connected' });
          sseService.broadcastToAdmins('users_update', { userId, wa_status: 'connected' });
          logger.info({ userId }, 'WhatsApp connected');
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : null;

          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;

          logger.info({ userId, statusCode, shouldReconnect }, 'WhatsApp connection closed');

          if (shouldReconnect) {
            logger.info({ userId, statusCode }, 'Connection closed — scheduling reconnect');
            if (connections.get(userId)?.socket === socket) {
              connections.delete(userId);
            }
            await updateUserWaStatus(userId, 'connecting');
            sseService.broadcastToUser(userId, 'wa_status', { status: 'connecting' });
            setTimeout(() => {
              connectWhatsApp(userId).catch((err) => {
                logger.warn({ err, userId }, 'Scheduled reconnect failed');
              });
            }, 3000);
          } else {
            // Logged out or Unauthorized (401) - clear auth
            if (connections.get(userId)?.socket === socket) {
              connections.delete(userId);
            }
            await updateUserWaStatus(userId, 'disconnected');
            await clearAuthState(userId);
            sseService.broadcastToUser(userId, 'wa_status', { status: 'disconnected' });
            sseService.broadcastToAdmins('users_update', { userId, wa_status: 'disconnected' });
          }
        }
      });

      return conn;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to connect WhatsApp');
      conn.status = 'disconnected';
      if (connections.get(userId)?.socket === conn.socket) {
        connections.delete(userId);
      }
      await updateUserWaStatus(userId, 'disconnected');
      throw err;
    }
  })();

  connectInFlight.set(userId, connectPromise);

  try {
    return await connectPromise;
  } finally {
    connectInFlight.delete(userId);
  }
}

async function disconnectWhatsApp(userId) {
  const conn = connections.get(userId);
  if (conn?.socket) {
    try {
      conn.socket.end(undefined);
    } catch {}
  }
  connections.delete(userId);
  await clearAuthState(userId);
  await updateUserWaStatus(userId, 'disconnected');
  sseService.broadcastToUser(userId, 'wa_status', { status: 'disconnected' });
}

async function clearAuthState(userId) {
  try {
    await query('DELETE FROM wa_auth_creds WHERE user_id = $1', [userId]);
    await query('DELETE FROM wa_auth_keys WHERE user_id = $1', [userId]);
    logger.info({ userId }, 'WhatsApp auth state cleared');
  } catch (err) {
    logger.error({ err }, 'Failed to clear auth state');
  }
}

function getConnection(userId) {
  return connections.get(userId) || null;
}

function getSocket(userId) {
  const conn = connections.get(userId);
  return conn?.socket || null;
}

function getStatus(userId) {
  const conn = connections.get(userId);
  if (!conn) return 'disconnected';
  return conn.status;
}

async function checkNumberOnWhatsApp(userId, phone) {
  const socket = getSocket(userId);
  if (!socket || getStatus(userId) !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  try {
    const jid = `${phone}@s.whatsapp.net`;
    const [result] = await socket.onWhatsApp(jid);
    return result?.exists === true;
  } catch (err) {
    logger.warn({ err, phone }, 'Failed to check number on WhatsApp');
    return false;
  }
}

async function sendMessage(userId, phone, payload) {
  const socket = getSocket(userId);
  if (!socket || getStatus(userId) !== 'connected') {
    return { success: false, error: 'WhatsApp not connected' };
  }

  try {
    const jid = `${phone}@s.whatsapp.net`;
    await socket.sendMessage(jid, payload);
    return { success: true };
  } catch (err) {
    logger.error({ err, userId, phone }, 'Failed to send WhatsApp message');
    return { success: false, error: err.message };
  }
}

async function ensureConnected(userId, { timeoutMs = 8000, pollMs = 250 } = {}) {
  if (getStatus(userId) === 'connected') return true;

  try {
    await connectWhatsApp(userId);
  } catch (err) {
    logger.warn({ err, userId }, 'Auto-connect attempt failed');
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (getStatus(userId) === 'connected') return true;
    await sleep(pollMs);
  }

  return getStatus(userId) === 'connected';
}

module.exports = {
  connectWhatsApp,
  disconnectWhatsApp,
  getConnection,
  getSocket,
  getStatus,
  ensureConnected,
  checkNumberOnWhatsApp,
  sendMessage,
};
