const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const logger = require('./logger');
const { dbRun } = require('./database');
const {
  useTursoAuthState,
  hasTursoAuthState,
  clearTursoAuthState,
} = require('./tursoAuthState');
const { publishUserUpdate, publishAdminUpdate } = require('../services/realtimeService');

const activeSockets = new Map();
const qrCodes = new Map();
const connectionStatus = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createWhatsAppSocket(userId) {
  const { state, saveCreds } = await useTursoAuthState(userId);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'silent' })
      ),
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['ProxySend', 'Chrome', '121.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  connectionStatus.set(userId, 'connecting');

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const QRCode = require('qrcode');
      try {
        const qrDataURL = await QRCode.toDataURL(qr);
        qrCodes.set(userId, qrDataURL);
        connectionStatus.set(userId, 'qr_ready');
        logger.info(`QR code generated for user ${userId}`);
      } catch (err) {
        logger.error(`QR code generation failed for user ${userId}: ${err.message}`);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.info(`WhatsApp connection closed for user ${userId}, status: ${statusCode}`);

      connectionStatus.set(userId, 'disconnected');
      activeSockets.delete(userId);
      qrCodes.delete(userId);
      publishUserUpdate(userId, 'whatsapp_status', { status: 'disconnected' });
      publishAdminUpdate('whatsapp_status', { userId: Number(userId), status: 'disconnected' });

      // Update database
      try {
        await dbRun('UPDATE users SET whatsapp_connected = 0 WHERE id = ?', [userId]);
      } catch (dbErr) {
        logger.error(`Failed to update whatsapp status for user ${userId}: ${dbErr.message}`);
      }

      if (shouldReconnect) {
        logger.info(`Attempting reconnect for user ${userId}...`);
        setTimeout(() => {
          createWhatsAppSocket(userId).catch((err) => {
            logger.error(`Reconnect failed for user ${userId}: ${err.message}`);
          });
        }, 5000);
      }
    }

    if (connection === 'open') {
      logger.info(`WhatsApp connected successfully for user ${userId}`);
      connectionStatus.set(userId, 'connected');
      qrCodes.delete(userId);
      activeSockets.set(userId, sock);
      publishUserUpdate(userId, 'whatsapp_status', { status: 'connected' });
      publishAdminUpdate('whatsapp_status', { userId: Number(userId), status: 'connected' });

      // Update database
      try {
        await dbRun('UPDATE users SET whatsapp_connected = 1 WHERE id = ?', [userId]);
      } catch (dbErr) {
        logger.error(`Failed to update whatsapp status for user ${userId}: ${dbErr.message}`);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return sock;
}

async function getSocket(userId) {
  if (activeSockets.has(userId)) {
    return activeSockets.get(userId);
  }

  const hasAuth = await hasTursoAuthState(userId);
  if (hasAuth) {
    return await createWhatsAppSocket(userId);
  }

  return null;
}

async function initializeSocket(userId) {
  if (activeSockets.has(userId)) {
    return activeSockets.get(userId);
  }
  return await createWhatsAppSocket(userId);
}

async function ensureConnectedSocket(userId, timeoutMs = 15000) {
  if (activeSockets.has(userId) && getConnectionStatus(userId) === 'connected') {
    return true;
  }

  if (getConnectionStatus(userId) === 'disconnected') {
    await getSocket(userId);
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (activeSockets.has(userId) && getConnectionStatus(userId) === 'connected') {
      return true;
    }
    await sleep(1000);
  }

  return activeSockets.has(userId) && getConnectionStatus(userId) === 'connected';
}

function getQRCode(userId) {
  return qrCodes.get(userId) || null;
}

function getConnectionStatus(userId) {
  return connectionStatus.get(userId) || 'disconnected';
}

function normalizeIndianPhoneNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;

  const withCountryCode = digits.startsWith('91') ? digits : `91${digits}`;
  if (!/^91\d{10}$/.test(withCountryCode)) {
    return null;
  }

  return withCountryCode;
}

async function doesWhatsAppNumberExist(userId, phone) {
  const normalizedPhone = normalizeIndianPhoneNumber(phone);
  if (!normalizedPhone) {
    return {
      success: false,
      exists: false,
      normalizedPhone: null,
      error: 'Invalid phone number format',
    };
  }

  const isConnected = await ensureConnectedSocket(userId, 5000);
  if (!isConnected) {
    return {
      success: false,
      exists: false,
      normalizedPhone,
      error: 'WhatsApp is not connected. Please connect WhatsApp first.',
    };
  }

  const sock = activeSockets.get(userId);
  if (!sock) {
    return {
      success: false,
      exists: false,
      normalizedPhone,
      error: 'WhatsApp is not connected. Please connect WhatsApp first.',
    };
  }

  try {
    const lookup = await sock.onWhatsApp(`${normalizedPhone}@s.whatsapp.net`);
    const exists = Array.isArray(lookup) && lookup[0] && lookup[0].exists === true;

    return {
      success: true,
      exists,
      normalizedPhone,
      error: null,
    };
  } catch (err) {
    logger.error(`WhatsApp number check failed for user ${userId}: ${err.message}`);
    return {
      success: false,
      exists: false,
      normalizedPhone,
      error: 'Failed to verify phone number on WhatsApp',
    };
  }
}

async function disconnectSocket(userId) {
  const sock = activeSockets.get(userId);
  if (sock) {
    await sock.logout();
    activeSockets.delete(userId);
  }

  connectionStatus.set(userId, 'disconnected');
  qrCodes.delete(userId);
  publishUserUpdate(userId, 'whatsapp_status', { status: 'disconnected' });
  publishAdminUpdate('whatsapp_status', { userId: Number(userId), status: 'disconnected' });

  await clearTursoAuthState(userId);
  await dbRun('UPDATE users SET whatsapp_connected = 0 WHERE id = ?', [userId]);

  logger.info(`WhatsApp disconnected for user ${userId}`);
}

async function sendTextMessage(userId, phone, message) {
  return await sendWhatsAppMessage(userId, phone, { text: message });
}

async function sendWhatsAppMessage(userId, phone, payload) {
  const isConnected = await ensureConnectedSocket(userId, 8000);
  if (!isConnected) {
    throw new Error('WhatsApp not connected');
  }

  const sock = activeSockets.get(userId);
  if (!sock) {
    throw new Error('WhatsApp not connected');
  }

  const jid = `${phone}@s.whatsapp.net`;
  await sock.sendMessage(jid, payload);
  logger.info(`Message sent to ${phone} by user ${userId}`);
}

module.exports = {
  createWhatsAppSocket,
  getSocket,
  initializeSocket,
  ensureConnectedSocket,
  getQRCode,
  getConnectionStatus,
  disconnectSocket,
  sendTextMessage,
  sendWhatsAppMessage,
  normalizeIndianPhoneNumber,
  doesWhatsAppNumberExist,
  activeSockets,
};