const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminMiddleware');
const adminController = require('../controllers/adminController');

router.get('/login', adminController.getAdminLogin);
router.post('/login', adminController.postAdminLogin);
router.get('/dashboard', requireAdmin, adminController.getAdminDashboard);
router.get('/add-credits', requireAdmin, adminController.getAddCredits);
router.post('/add-credits', requireAdmin, adminController.postAddCredits);
router.get('/logout', adminController.adminLogout);

module.exports = router;