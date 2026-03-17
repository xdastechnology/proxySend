const CampaignModel = require('../models/campaignModel');
const TemplateModel = require('../models/templateModel');
const ContactModel = require('../models/contactModel');
const campaignService = require('../services/campaignService');
const logger = require('../config/logger');

async function getCampaigns(req, res) {
  try {
    const userId = req.session.user.id;
    const campaigns = await CampaignModel.findByUserId(userId);

    res.render('campaigns', {
      title: 'Campaigns - ProxySend',
      campaigns: Array.isArray(campaigns) ? campaigns : [],
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getCampaigns error: ${err.message}`);
    res.redirect('/dashboard?error=Failed to load campaigns');
  }
}

async function getCreateCampaign(req, res) {
  try {
    const userId = req.session.user.id;
    const [templates, contacts] = await Promise.all([
      TemplateModel.findByUserId(userId),
      ContactModel.findAllByUserId(userId),
    ]);

    res.render('createCampaign', {
      title: 'Create Campaign - ProxySend',
      templates: Array.isArray(templates) ? templates : [],
      contacts: Array.isArray(contacts) ? contacts : [],
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getCreateCampaign error: ${err.message}`);
    res.redirect('/campaigns?error=Failed to load campaign form');
  }
}

async function createCampaign(req, res) {
  try {
    const userId = req.session.user.id;
    const { campaignName, templateId, contactIds } = req.body;

    if (!campaignName || !templateId || !contactIds) {
      return res.redirect('/campaigns/create?error=All fields are required');
    }

    const contactIdArray = Array.isArray(contactIds)
      ? contactIds.map(Number)
      : [Number(contactIds)];

    if (contactIdArray.length === 0) {
      return res.redirect('/campaigns/create?error=Please select at least one contact');
    }

    const template = await TemplateModel.findById(templateId, userId);
    if (!template) {
      return res.redirect('/campaigns/create?error=Template not found');
    }

    const campaignId = await CampaignModel.create({
      userId,
      campaignName: campaignName.trim(),
      templateId: parseInt(templateId),
      contactIds: contactIdArray,
    });

    logger.info(`Campaign ${campaignId} created by user ${userId}`);
    res.redirect(`/campaigns?success=Campaign created successfully`);
  } catch (err) {
    logger.error(`createCampaign error: ${err.message}`);
    res.redirect('/campaigns/create?error=Failed to create campaign');
  }
}

async function startCampaign(req, res) {
  try {
    const userId = req.session.user.id;
    const campaignId = req.params.id;

    const campaign = await CampaignModel.findById(campaignId, userId);

    if (!campaign) {
      return res.redirect('/campaigns?error=Campaign not found');
    }

    if (campaign.status === 'running') {
      return res.redirect('/campaigns?error=Campaign is already running');
    }

    if (campaign.status === 'completed') {
      return res.redirect('/campaigns?error=Campaign already completed');
    }

    if (campaignService.isCampaignRunning(campaignId)) {
      return res.redirect('/campaigns?error=Campaign is already running in background');
    }

    // Start campaign asynchronously
    campaignService.runCampaign(userId, campaignId).catch((err) => {
      logger.error(`Campaign ${campaignId} failed: ${err.message}`);
    });

    logger.info(`Campaign ${campaignId} started by user ${userId}`);
    res.redirect('/campaigns?success=Campaign started in background. Progress will update in realtime.');
  } catch (err) {
    logger.error(`startCampaign error: ${err.message}`);
    res.redirect('/campaigns?error=Failed to start campaign');
  }
}

async function getCampaignDetails(req, res) {
  try {
    const userId = req.session.user.id;
    const campaignId = req.params.id;

    const campaign = await CampaignModel.findById(campaignId, userId);
    if (!campaign) {
      return res.redirect('/campaigns?error=Campaign not found');
    }

    const campaignContacts = await CampaignModel.getCampaignContacts(campaignId);

    res.render('campaignDetails', {
      title: `Campaign Details - ${campaign.campaign_name}`,
      campaign,
      campaignContacts: Array.isArray(campaignContacts) ? campaignContacts : [],
      error: req.query.error || null,
    });
  } catch (err) {
    logger.error(`getCampaignDetails error: ${err.message}`);
    res.redirect('/campaigns?error=Failed to load campaign details');
  }
}

async function deleteCampaign(req, res) {
  try {
    const userId = req.session.user.id;
    const campaignId = req.params.id;

    const deleted = await CampaignModel.delete(campaignId, userId);

    if (!deleted) {
      return res.redirect('/campaigns?error=Campaign not found');
    }

    logger.info(`Campaign ${campaignId} deleted by user ${userId}`);
    res.redirect('/campaigns?success=Campaign deleted successfully');
  } catch (err) {
    logger.error(`deleteCampaign error: ${err.message}`);
    res.redirect('/campaigns?error=Failed to delete campaign');
  }
}

module.exports = {
  getCampaigns,
  getCreateCampaign,
  createCampaign,
  startCampaign,
  getCampaignDetails,
  deleteCampaign,
};