// controllers/adminController.js
const UserModel = require('../models/userModel');
const { dbRun, dbGet, dbAll } = require('../config/database');
const logger = require('../config/logger');

async function getAdminLogin(req, res) {
  res.render('admin/login', {
    title: 'Admin Login - ProxySend',
    error: req.query.error || null,
  });
}

async function postAdminLogin(req, res) {
  try {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.render('admin/login', {
        title: 'Admin Login - ProxySend',
        error: 'Invalid admin password',
      });
    }
    req.session.isAdmin = true;
    logger.info('Admin logged in');
    return res.redirect('/admin/dashboard');
  } catch (err) {
    logger.error(`postAdminLogin error: ${err.message}`);
    return res.redirect('/admin/login?error=Login failed');
  }
}

async function getAdminDashboard(req, res) {
  try {
    const users = await UserModel.getAllUsers();
    const totalTransactions = await dbGet('SELECT COUNT(*) as count FROM credit_transactions');
    const totalMessages = await dbGet('SELECT COUNT(*) as count FROM message_logs');
    const recentTransactions = await dbAll(
      `SELECT ct.*, u.name, u.email
       FROM credit_transactions ct
       JOIN users u ON ct.user_id = u.id
       ORDER BY ct.created_at DESC
       LIMIT 10`
    );

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - ProxySend',
      users,
      totalTransactions: totalTransactions ? totalTransactions.count : 0,
      totalMessages: totalMessages ? totalMessages.count : 0,
      recentTransactions,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getAdminDashboard error: ${err.message}`);
    res.redirect('/admin/login?error=Failed to load dashboard');
  }
}

async function getAddCredits(req, res) {
  try {
    const users = await UserModel.getAllUsers();
    res.render('admin/addCredits', {
      title: 'Add Credits - ProxySend Admin',
      users,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getAddCredits error: ${err.message}`);
    res.redirect('/admin/dashboard?error=Failed to load credits form');
  }
}

async function postAddCredits(req, res) {
  try {
    const { userEmail, creditsToAdd, adminNote } = req.body;

    if (!userEmail || !creditsToAdd) {
      return res.redirect('/admin/add-credits?error=Email and credits amount are required');
    }

    const credits = parseInt(creditsToAdd);
    if (isNaN(credits) || credits <= 0) {
      return res.redirect('/admin/add-credits?error=Credits must be a positive number');
    }

    const user = await UserModel.findByEmail(userEmail.toLowerCase().trim());
    if (!user) {
      return res.redirect('/admin/add-credits?error=User not found');
    }

    await UserModel.updateCredits(user.id, credits);
    await dbRun(
      'INSERT INTO credit_transactions (user_id, credits_added, admin_note) VALUES (?, ?, ?)',
      [user.id, credits, adminNote || 'Manual credit addition by admin']
    );

    logger.info(`Admin added ${credits} credits to user ${userEmail}`);
    return res.redirect(
      `/admin/add-credits?success=${credits} credits added to ${userEmail} successfully`
    );
  } catch (err) {
    logger.error(`postAddCredits error: ${err.message}`);
    return res.redirect('/admin/add-credits?error=Failed to add credits');
  }
}

async function adminLogout(req, res) {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
}

module.exports = {
  getAdminLogin,
  postAdminLogin,
  getAdminDashboard,
  getAddCredits,
  postAddCredits,
  adminLogout,
};