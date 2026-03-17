// controllers/creditController.js
const UserModel = require('../models/userModel');
const CampaignModel = require('../models/campaignModel');
const CreditRequestModel = require('../models/creditRequestModel');
const { dbAll, dbGet } = require('../config/database');
const { publishUserUpdate, publishAdminUpdate } = require('../services/realtimeService');
const logger = require('../config/logger');

async function getCredits(req, res) {
  try {
    const userId = req.session.user.id;
    const [user, transactions, creditRequests, campaignCreditUsage, userReferenceCode] = await Promise.all([
      UserModel.findById(userId),
      dbAll(
        `SELECT ct.*, rc.code as reference_code
         FROM credit_transactions ct
         LEFT JOIN reference_codes rc ON rc.id = ct.reference_code_id
         WHERE ct.user_id = ?
         ORDER BY ct.created_at DESC
         LIMIT 30`,
        [userId]
      ),
      CreditRequestModel.findByUserId(userId, 30),
      CampaignModel.getCreditUsageByUserId(userId, 50),
      dbGet(
        `SELECT rc.id, rc.code, rc.price_inr, rc.marketing_message
         FROM users u
         LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
         WHERE u.id = ?`,
        [userId]
      ),
    ]);

    res.render('credits', {
      title: 'Credits - ProxySend',
      credits: user ? user.credits : 0,
      transactions: Array.isArray(transactions) ? transactions : [],
      creditRequests: Array.isArray(creditRequests) ? creditRequests : [],
      campaignCreditUsage: Array.isArray(campaignCreditUsage) ? campaignCreditUsage : [],
      userReferenceCode: userReferenceCode || null,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getCredits error: ${err.message}`);
    res.redirect('/dashboard?error=Failed to load credits');
  }
}

async function postCreditRequest(req, res) {
  try {
    const userId = req.session.user.id;
    const requestedCredits = Number.parseInt(req.body.requestedCredits, 10);
    const requestNote = String(req.body.requestNote || '').trim();

    if (!Number.isInteger(requestedCredits) || requestedCredits <= 0) {
      return res.redirect('/credits?error=Requested credits must be a positive number');
    }

    if (requestedCredits > 100000) {
      return res.redirect('/credits?error=Requested credits value is too high');
    }

    const pendingRequest = await dbGet(
      "SELECT id FROM credit_requests WHERE user_id = ? AND status = 'pending' LIMIT 1",
      [userId]
    );
    if (pendingRequest) {
      return res.redirect('/credits?error=You already have a pending credit request');
    }

    const userReferenceCode = await dbGet(
      `SELECT rc.id, rc.price_inr
       FROM users u
       LEFT JOIN reference_codes rc ON rc.id = u.reference_code_id
       WHERE u.id = ?`,
      [userId]
    );

    const perMessagePrice = userReferenceCode ? Number(userReferenceCode.price_inr || 0) : 0;
    const totalPriceInr = perMessagePrice > 0
      ? Number((perMessagePrice * requestedCredits).toFixed(2))
      : null;

    const requestId = await CreditRequestModel.create({
      userId,
      requestedCredits,
      requestNote,
      referenceCodeId: userReferenceCode ? userReferenceCode.id : null,
      priceInr: totalPriceInr,
    });

    publishUserUpdate(userId, 'credit_request_created', {
      requestId,
      requestedCredits,
    });
    publishAdminUpdate('credit_request_created', {
      requestId,
      userId,
      requestedCredits,
    });

    return res.redirect('/credits?success=Credit request submitted successfully');
  } catch (err) {
    logger.error(`postCreditRequest error: ${err.message}`);
    return res.redirect('/credits?error=Failed to submit credit request');
  }
}

module.exports = { getCredits, postCreditRequest };