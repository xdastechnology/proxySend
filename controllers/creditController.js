// controllers/creditController.js
const UserModel = require('../models/userModel');
const { dbAll } = require('../config/database');
const logger = require('../config/logger');

async function getCredits(req, res) {
  try {
    const userId = req.session.user.id;
    const user = await UserModel.findById(userId);
    const transactions = await dbAll(
      'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    res.render('credits', {
      title: 'Credits - ProxySend',
      credits: user ? user.credits : 0,
      transactions,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getCredits error: ${err.message}`);
    res.redirect('/dashboard?error=Failed to load credits');
  }
}

module.exports = { getCredits };