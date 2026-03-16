const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireGuest } = require('../middleware/authMiddleware');

router.get('/', (req, res) => res.redirect('/dashboard'));
router.get('/login', requireGuest, authController.getLogin);
router.get('/register', requireGuest, authController.getRegister);
router.post('/login', requireGuest, authController.postLogin);
router.post('/register', requireGuest, authController.postRegister);
router.get('/logout', authController.logout);

module.exports = router;