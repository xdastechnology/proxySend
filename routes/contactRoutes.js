const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../middleware/authMiddleware');
const contactController = require('../controllers/contactController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'data', 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `import_${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Ensure uploads directory exists
const fs = require('fs');
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.get('/', requireAuth, contactController.getContacts);
router.get('/edit/:id', requireAuth, contactController.getEditContact);
router.post('/add', requireAuth, contactController.addContact);
router.post('/update/:id', requireAuth, contactController.updateContact);
router.post('/import', requireAuth, upload.single('csvFile'), contactController.importContacts);
router.get('/export', requireAuth, contactController.exportContactsCsv);
router.get('/delete/:id', requireAuth, contactController.deleteContact);
router.get('/search', requireAuth, contactController.searchContacts);

module.exports = router;