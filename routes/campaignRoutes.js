const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const campaignController = require('../controllers/campaignController');

router.get('/', requireAuth, campaignController.getCampaigns);
router.get('/create', requireAuth, campaignController.getCreateCampaign);
router.post('/create', requireAuth, campaignController.createCampaign);
router.get('/start/:id', requireAuth, campaignController.startCampaign);
router.get('/details/:id', requireAuth, campaignController.getCampaignDetails);
router.get('/delete/:id', requireAuth, campaignController.deleteCampaign);

module.exports = router;