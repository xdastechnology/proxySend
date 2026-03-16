const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/authMiddleware');
const templateController = require('../controllers/templateController');

const mediaTempDir = path.join(__dirname, '..', 'data', 'uploads', 'template-temp');
if (!fs.existsSync(mediaTempDir)) {
	fs.mkdirSync(mediaTempDir, { recursive: true });
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, mediaTempDir);
	},
	filename: (req, file, cb) => {
		const safe = file.originalname.replace(/\s+/g, '_');
		cb(null, `tpl_${Date.now()}_${safe}`);
	},
});

const upload = multer({
	storage,
	fileFilter: (req, file, cb) => {
		const type = file.mimetype || '';
		if (
			type.startsWith('image/') ||
			type.startsWith('video/') ||
			type === 'application/pdf'
		) {
			return cb(null, true);
		}

		return cb(new Error('Only image, video, and PDF files are allowed'));
	},
	limits: { fileSize: 25 * 1024 * 1024 },
});

function handleMediaUpload(req, res, next) {
	upload.single('mediaFile')(req, res, (err) => {
		if (!err) return next();

		const encoded = encodeURIComponent(err.message || 'Media upload failed');
		if (req.path.startsWith('/update/')) {
			const templateId = req.params.id;
			return res.redirect(`/templates/edit/${templateId}?error=${encoded}`);
		}

		return res.redirect(`/templates?error=${encoded}`);
	});
}

router.get('/', requireAuth, templateController.getTemplates);
router.post('/create', requireAuth, handleMediaUpload, templateController.createTemplate);
router.get('/edit/:id', requireAuth, templateController.getEditTemplate);
router.post('/update/:id', requireAuth, handleMediaUpload, templateController.updateTemplate);
router.get('/delete/:id', requireAuth, templateController.deleteTemplate);

module.exports = router;