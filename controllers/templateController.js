const TemplateModel = require('../models/templateModel');
const logger = require('../config/logger');
const mediaStorageService = require('../services/mediaStorageService');

function parseButtonsJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        label: (item.label || '').toString().trim(),
        url: (item.url || '').toString().trim(),
      }))
      .filter((item) => item.label && item.url);
  } catch (err) {
    return [];
  }
}

function mapTemplateForView(template) {
  if (!template) return null;
  return {
    ...template,
    buttons: parseButtonsJson(template.buttons_json),
  };
}

function mapTemplatesForView(templates) {
  return (Array.isArray(templates) ? templates : []).map(mapTemplateForView);
}

function normalizeTemplateButtons(body) {
  const labels = Array.isArray(body.buttonLabel)
    ? body.buttonLabel
    : (body.buttonLabel ? [body.buttonLabel] : []);
  const urls = Array.isArray(body.buttonUrl)
    ? body.buttonUrl
    : (body.buttonUrl ? [body.buttonUrl] : []);

  const size = Math.max(labels.length, urls.length);
  const buttons = [];

  for (let i = 0; i < size; i += 1) {
    const label = (labels[i] || '').toString().trim();
    const url = (urls[i] || '').toString().trim();

    if (!label && !url) continue;
    if (!label || !url) {
      return { error: 'Each button requires both label and URL' };
    }

    if (!/^https?:\/\//i.test(url)) {
      return { error: 'Button URLs must start with http:// or https://' };
    }

    buttons.push({
      label: label.slice(0, 30),
      url,
    });
  }

  if (buttons.length > 3) {
    return { error: 'Maximum 3 buttons are allowed per template' };
  }

  return { buttons };
}

async function getTemplates(req, res) {
  try {
    const userId = req.session.user.id;
    const templates = mapTemplatesForView(await TemplateModel.findByUserId(userId));

    res.render('templates', {
      title: 'Templates - ProxySend',
      templates,
      error: req.query.error || null,
      success: req.query.success || null,
      editTemplate: null,
    });
  } catch (err) {
    logger.error(`getTemplates error: ${err.message}`);
    res.redirect('/dashboard?error=Failed to load templates');
  }
}

async function createTemplate(req, res) {
  try {
    const userId = req.session.user.id;
    const { templateName, message } = req.body;
    const buttonResult = normalizeTemplateButtons(req.body);
    if (buttonResult.error) {
      if (req.file) mediaStorageService.cleanupTempFile(req.file.path);
      return res.redirect(`/templates?error=${encodeURIComponent(buttonResult.error)}`);
    }

    const buttonsJson = buttonResult.buttons.length > 0 ? JSON.stringify(buttonResult.buttons) : null;
    const cleanName = (templateName || '').trim();
    const cleanMessage = (message || '').trim();

    if (!cleanName || (!cleanMessage && !req.file)) {
      if (req.file) mediaStorageService.cleanupTempFile(req.file.path);
      const templates = mapTemplatesForView(await TemplateModel.findByUserId(userId));
      return res.render('templates', {
        title: 'Templates - ProxySend',
        templates,
        error: 'Template name and at least a message or media file are required',
        success: null,
        editTemplate: null,
      });
    }

    const media = (await mediaStorageService.storeUploadedFile(req.file)) || {
      mediaType: null,
      mediaPath: null,
      mediaMime: null,
      mediaName: null,
    };

    await TemplateModel.create({
      userId,
      templateName: cleanName,
      message: cleanMessage,
      mediaType: media.mediaType,
      mediaPath: media.mediaPath,
      mediaMime: media.mediaMime,
      mediaName: media.mediaName,
      buttonsJson,
    });

    logger.info(`Template created by user ${userId}: ${cleanName}`);
    res.redirect('/templates?success=Template created successfully');
  } catch (err) {
    if (req.file) mediaStorageService.cleanupTempFile(req.file.path);
    logger.error(`createTemplate error: ${err.message}`);
    res.redirect('/templates?error=Failed to create template');
  }
}

async function getEditTemplate(req, res) {
  try {
    const userId = req.session.user.id;
    const templateId = req.params.id;
    const template = mapTemplateForView(await TemplateModel.findById(templateId, userId));

    if (!template) {
      return res.redirect('/templates?error=Template not found');
    }

    const templates = mapTemplatesForView(await TemplateModel.findByUserId(userId));

    res.render('templates', {
      title: 'Edit Template - ProxySend',
      templates,
      error: null,
      success: null,
      editTemplate: template,
    });
  } catch (err) {
    logger.error(`getEditTemplate error: ${err.message}`);
    res.redirect('/templates?error=Failed to load template');
  }
}

async function updateTemplate(req, res) {
  let newUploadedMediaPath = null;
  try {
    const userId = req.session.user.id;
    const templateId = req.params.id;
    const { templateName, message } = req.body;
    const buttonResult = normalizeTemplateButtons(req.body);
    if (buttonResult.error) {
      if (req.file) mediaStorageService.cleanupTempFile(req.file.path);
      return res.redirect(`/templates/edit/${templateId}?error=${encodeURIComponent(buttonResult.error)}`);
    }

    const buttonsJson = buttonResult.buttons.length > 0 ? JSON.stringify(buttonResult.buttons) : null;
    const removeMedia = req.body.removeMedia === '1';
    const cleanName = (templateName || '').trim();
    const cleanMessage = (message || '').trim();

    const existingTemplate = await TemplateModel.findById(templateId, userId);
    if (!existingTemplate) {
      if (req.file) mediaStorageService.cleanupTempFile(req.file.path);
      return res.redirect('/templates?error=Template not found');
    }

    if (!cleanName) {
      if (req.file) mediaStorageService.cleanupTempFile(req.file.path);
      return res.redirect(`/templates/edit/${templateId}?error=Template name is required`);
    }

    let mediaType = existingTemplate.media_type || null;
    let mediaPath = existingTemplate.media_path || null;
    let mediaMime = existingTemplate.media_mime || null;
    let mediaName = existingTemplate.media_name || null;
    let oldMediaToDelete = null;

    if (removeMedia && mediaPath) {
      oldMediaToDelete = mediaPath;
      mediaType = null;
      mediaPath = null;
      mediaMime = null;
      mediaName = null;
    }

    if (req.file) {
      const payload = await mediaStorageService.storeUploadedFile(req.file);
      newUploadedMediaPath = payload.mediaPath;
      if (mediaPath && mediaPath !== payload.mediaPath) {
        oldMediaToDelete = mediaPath;
      }
      mediaType = payload.mediaType;
      mediaPath = payload.mediaPath;
      mediaMime = payload.mediaMime;
      mediaName = payload.mediaName;
    }

    if (!cleanMessage && !mediaPath) {
      if (newUploadedMediaPath) {
        await mediaStorageService.removeStoredMedia(newUploadedMediaPath);
      } else if (req.file) {
        mediaStorageService.cleanupTempFile(req.file.path);
      }
      return res.redirect(`/templates/edit/${templateId}?error=Template needs a message or media file`);
    }

    const updated = await TemplateModel.update(templateId, userId, {
      templateName: cleanName,
      message: cleanMessage,
      mediaType,
      mediaPath,
      mediaMime,
      mediaName,
      buttonsJson,
    });

    if (!updated) {
      if (newUploadedMediaPath) {
        await mediaStorageService.removeStoredMedia(newUploadedMediaPath);
      } else if (req.file) {
        mediaStorageService.cleanupTempFile(req.file.path);
      }
      return res.redirect('/templates?error=Template not found');
    }

    if (oldMediaToDelete && oldMediaToDelete !== mediaPath) {
      await mediaStorageService.removeStoredMedia(oldMediaToDelete);
    }

    logger.info(`Template ${templateId} updated by user ${userId}`);
    res.redirect('/templates?success=Template updated successfully');
  } catch (err) {
    if (newUploadedMediaPath) {
      try {
        await mediaStorageService.removeStoredMedia(newUploadedMediaPath);
      } catch (cleanupErr) {
        logger.error(`Failed cleanup for uploaded media: ${cleanupErr.message}`);
      }
    } else if (req.file) {
      mediaStorageService.cleanupTempFile(req.file.path);
    }
    logger.error(`updateTemplate error: ${err.message}`);
    res.redirect('/templates?error=Failed to update template');
  }
}

async function deleteTemplate(req, res) {
  try {
    const userId = req.session.user.id;
    const templateId = req.params.id;
    const template = await TemplateModel.findById(templateId, userId);

    const deleted = await TemplateModel.delete(templateId, userId);

    if (!deleted) {
      return res.redirect('/templates?error=Template not found');
    }

    if (template && template.media_path) {
      await mediaStorageService.removeStoredMedia(template.media_path);
    }

    logger.info(`Template ${templateId} deleted by user ${userId}`);
    res.redirect('/templates?success=Template deleted successfully');
  } catch (err) {
    logger.error(`deleteTemplate error: ${err.message}`);
    res.redirect('/templates?error=Failed to delete template');
  }
}

module.exports = {
  getTemplates,
  createTemplate,
  getEditTemplate,
  updateTemplate,
  deleteTemplate,
};