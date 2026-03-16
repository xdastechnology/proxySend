const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const whatsappController = require('../controllers/whatsappController');

router.get('/', requireAuth, whatsappController.getWhatsAppPage);
router.get('/connect', requireAuth, whatsappController.connectWhatsApp);
router.get('/qr', requireAuth, whatsappController.getQRPage);
router.get('/status', requireAuth, whatsappController.getStatus);
router.get('/disconnect', requireAuth, whatsappController.disconnectWhatsApp);

module.exports = router;