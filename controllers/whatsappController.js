const {
  initializeSocket,
  getQRCode,
  getConnectionStatus,
  disconnectSocket,
} = require('../config/baileys');
const UserModel = require('../models/userModel');
const logger = require('../config/logger');

async function getWhatsAppPage(req, res) {
  try {
    const userId = req.session.user.id;
    const user = await UserModel.findById(userId);
    const status = getConnectionStatus(userId);

    res.render('whatsapp', {
      title: 'WhatsApp Connection - ProxySend',
      user,
      connectionStatus: status,
      qrCode: null,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getWhatsAppPage error: ${err.message}`);
    res.redirect('/dashboard?error=Failed to load WhatsApp page');
  }
}

async function connectWhatsApp(req, res) {
  try {
    const userId = req.session.user.id;

    logger.info(`Initiating WhatsApp connection for user ${userId}`);
    await initializeSocket(userId);

    // Wait briefly for QR code generation
    await new Promise((resolve) => setTimeout(resolve, 3000));

    res.redirect('/whatsapp/qr');
  } catch (err) {
    logger.error(`connectWhatsApp error: ${err.message}`);
    res.redirect('/whatsapp?error=Failed to initiate WhatsApp connection');
  }
}

async function getQRPage(req, res) {
  try {
    const userId = req.session.user.id;
    const status = getConnectionStatus(userId);
    const qrCode = getQRCode(userId);
    const user = await UserModel.findById(userId);

    res.render('whatsapp', {
      title: 'Scan QR Code - ProxySend',
      user,
      connectionStatus: status,
      qrCode,
      error: null,
      success: null,
    });
  } catch (err) {
    logger.error(`getQRPage error: ${err.message}`);
    res.redirect('/whatsapp?error=Failed to load QR code');
  }
}

async function getStatus(req, res) {
  try {
    const userId = req.session.user.id;
    const status = getConnectionStatus(userId);
    const qrCode = getQRCode(userId);

    res.json({ status, qrCode });
  } catch (err) {
    logger.error(`getStatus error: ${err.message}`);
    res.json({ status: 'error', qrCode: null });
  }
}

async function disconnectWhatsApp(req, res) {
  try {
    const userId = req.session.user.id;
    await disconnectSocket(userId);

    logger.info(`WhatsApp disconnected by user ${userId}`);
    res.redirect('/whatsapp?success=WhatsApp disconnected successfully');
  } catch (err) {
    logger.error(`disconnectWhatsApp error: ${err.message}`);
    res.redirect('/whatsapp?error=Failed to disconnect WhatsApp');
  }
}

module.exports = {
  getWhatsAppPage,
  connectWhatsApp,
  getQRPage,
  getStatus,
  disconnectWhatsApp,
};