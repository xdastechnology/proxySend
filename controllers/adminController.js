// controllers/adminController.js
const UserModel = require('../models/userModel');
const ReferenceCodeModel = require('../models/referenceCodeModel');
const CreditRequestModel = require('../models/creditRequestModel');
const { dbRun, dbGet, dbAll, dbTransaction } = require('../config/database');
const { publishUserUpdate, publishAdminUpdate } = require('../services/realtimeService');
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
    const [
      users,
      totalTransactions,
      totalMessages,
      recentTransactions,
      referenceCodes,
      pendingCreditRequests,
    ] = await Promise.all([
      UserModel.getAllUsers(),
      dbGet('SELECT COUNT(*) as count FROM credit_transactions'),
      dbGet('SELECT COUNT(*) as count FROM message_logs'),
      dbAll(
        `SELECT ct.*, u.name, u.email
         FROM credit_transactions ct
         JOIN users u ON ct.user_id = u.id
         ORDER BY ct.created_at DESC
         LIMIT 10`
      ),
      ReferenceCodeModel.getAllWithUserCounts(),
      CreditRequestModel.findPendingWithUsers(20),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - ProxySend',
      users,
      totalTransactions: totalTransactions ? totalTransactions.count : 0,
      totalMessages: totalMessages ? totalMessages.count : 0,
      recentTransactions,
      referenceCodes: Array.isArray(referenceCodes) ? referenceCodes : [],
      pendingCreditRequests: Array.isArray(pendingCreditRequests) ? pendingCreditRequests : [],
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
    const [users, referenceCodes, pendingCreditRequests] = await Promise.all([
      UserModel.getAllUsers(),
      ReferenceCodeModel.getAllWithUserCounts(),
      CreditRequestModel.findPendingWithUsers(30),
    ]);

    res.render('admin/addCredits', {
      title: 'Add Credits - ProxySend Admin',
      users,
      referenceCodes: Array.isArray(referenceCodes) ? referenceCodes : [],
      pendingCreditRequests: Array.isArray(pendingCreditRequests) ? pendingCreditRequests : [],
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
      `INSERT INTO credit_transactions (user_id, credits_added, admin_note, source)
       VALUES (?, ?, ?, 'admin_manual')`,
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

async function postCreateReferenceCode(req, res) {
  try {
    const { code, priceInr, marketingMessage } = req.body;
    const normalizedCode = ReferenceCodeModel.normalizeCode(code);
    const parsedPrice = Number.parseFloat(priceInr);

    if (!normalizedCode || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.redirect('/admin/add-credits?error=Reference code and valid INR per-message price are required');
    }

    if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedCode)) {
      return res.redirect('/admin/add-credits?error=Reference code must be 3-32 chars (A-Z, 0-9, _, -)');
    }

    const existing = await ReferenceCodeModel.findByCode(normalizedCode);
    if (existing) {
      return res.redirect('/admin/add-credits?error=Reference code already exists');
    }

    await ReferenceCodeModel.create({
      code: normalizedCode,
      priceInr: parsedPrice,
      marketingMessage: String(marketingMessage || '').trim(),
    });

    publishAdminUpdate('reference_code_created', { code: normalizedCode });
    return res.redirect('/admin/add-credits?success=Reference code created successfully');
  } catch (err) {
    logger.error(`postCreateReferenceCode error: ${err.message}`);
    return res.redirect('/admin/add-credits?error=Failed to create reference code');
  }
}

async function postToggleReferenceCode(req, res) {
  try {
    const codeId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(codeId) || codeId <= 0) {
      return res.redirect('/admin/add-credits?error=Invalid reference code id');
    }

    const currentCode = await ReferenceCodeModel.findById(codeId);
    if (!currentCode) {
      return res.redirect('/admin/add-credits?error=Reference code not found');
    }

    const nextActiveState = currentCode.is_active ? 0 : 1;
    await ReferenceCodeModel.setActive(codeId, nextActiveState === 1);

    publishAdminUpdate('reference_code_toggled', {
      codeId,
      isActive: nextActiveState === 1,
    });

    return res.redirect(
      `/admin/add-credits?success=Reference code ${nextActiveState === 1 ? 'activated' : 'deactivated'} successfully`
    );
  } catch (err) {
    logger.error(`postToggleReferenceCode error: ${err.message}`);
    return res.redirect('/admin/add-credits?error=Failed to update reference code');
  }
}

async function postReviewCreditRequest(req, res) {
  try {
    const requestId = Number.parseInt(req.params.id, 10);
    const action = String(req.body.action || '').trim().toLowerCase();
    const adminNote = String(req.body.adminNote || '').trim();
    const requestedApprovedCredits = Number.parseInt(req.body.approvedCredits, 10);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.redirect('/admin/add-credits?error=Invalid credit request id');
    }

    if (action !== 'approve' && action !== 'reject') {
      return res.redirect('/admin/add-credits?error=Invalid request action');
    }

    const outcome = await dbTransaction(async (tx) => {
      const creditRequest = await tx.get('SELECT * FROM credit_requests WHERE id = ?', [requestId]);
      if (!creditRequest) {
        throw new Error('Credit request not found');
      }

      if (creditRequest.status !== 'pending') {
        throw new Error('This credit request has already been processed');
      }

      const isApprove = action === 'approve';
      const approvedCredits = isApprove
        ? (!Number.isNaN(requestedApprovedCredits) && requestedApprovedCredits > 0
            ? requestedApprovedCredits
            : Number(creditRequest.requested_credits || 0))
        : 0;

      if (isApprove && approvedCredits <= 0) {
        throw new Error('Approved credits must be greater than zero');
      }

      if (isApprove) {
        await tx.run(
          'UPDATE users SET credits = credits + ? WHERE id = ?',
          [approvedCredits, creditRequest.user_id]
        );

        await tx.run(
          `INSERT INTO credit_transactions (
            user_id,
            credits_added,
            admin_note,
            source,
            request_id,
            inr_amount,
            reference_code_id
          ) VALUES (?, ?, ?, 'request_approved', ?, ?, ?)`,
          [
            creditRequest.user_id,
            approvedCredits,
            adminNote || 'Credit request approved by admin',
            creditRequest.id,
            creditRequest.price_inr,
            creditRequest.reference_code_id,
          ]
        );
      }

      await tx.run(
        `UPDATE credit_requests
         SET status = ?,
             admin_note = ?,
             approved_credits = ?,
             resolved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          isApprove ? 'approved' : 'rejected',
          adminNote || (isApprove ? 'Approved by admin' : 'Rejected by admin'),
          approvedCredits,
          requestId,
        ]
      );

      return {
        userId: Number(creditRequest.user_id),
        approvedCredits,
        status: isApprove ? 'approved' : 'rejected',
      };
    });

    publishUserUpdate(outcome.userId, 'credit_request_reviewed', {
      requestId,
      status: outcome.status,
      approvedCredits: outcome.approvedCredits,
    });
    publishAdminUpdate('credit_request_reviewed', {
      requestId,
      status: outcome.status,
      approvedCredits: outcome.approvedCredits,
    });

    if (outcome.status === 'approved') {
      publishUserUpdate(outcome.userId, 'credits_updated', {
        source: 'credit_request_approved',
        creditsAdded: outcome.approvedCredits,
      });
      publishAdminUpdate('credits_updated', {
        userId: outcome.userId,
        source: 'credit_request_approved',
        creditsAdded: outcome.approvedCredits,
      });
    }

    return res.redirect(
      `/admin/add-credits?success=Credit request ${outcome.status === 'approved' ? 'approved' : 'rejected'} successfully`
    );
  } catch (err) {
    logger.error(`postReviewCreditRequest error: ${err.message}`);
    return res.redirect(`/admin/add-credits?error=${encodeURIComponent(err.message || 'Failed to process request')}`);
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
  postCreateReferenceCode,
  postToggleReferenceCode,
  postReviewCreditRequest,
  adminLogout,
};