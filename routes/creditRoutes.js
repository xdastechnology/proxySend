const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const creditController = require('../controllers/creditController');

router.get('/', requireAuth, creditController.getCredits);
router.post('/request', requireAuth, creditController.postCreditRequest);

module.exports = router;