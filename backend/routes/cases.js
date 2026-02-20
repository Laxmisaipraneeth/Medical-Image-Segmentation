const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Case = require('../models/Case');
const authMiddleware = require('../middleware/auth');
const { runSegmentation } = require('../services/flaskService');

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

// Configure Multer storage with UUID filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const caseId = req.params.caseId || 'temp';
    const fieldDir = file.fieldname === 'supportImages' ? 'support_sets'
                   : file.fieldname === 'supportLabels' ? 'support_sets'
                   : 'raw';
    const dir = path.join(UPLOAD_DIR, fieldDir, caseId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === 'supportLabels' ? 'label_' : '';
    cb(null, `${prefix}${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PNG, JPG, JPEG files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// All routes require authentication
router.use(authMiddleware);

// POST /api/cases — Create a new case with patient details
router.post('/', async (req, res) => {
  try {
    const caseData = new Case({
      radiologistId: req.userId,
      patientDetails: req.body.patientDetails,
      status: 'created',
    });
    await caseData.save();
    res.status(201).json({ message: 'Case created', case: caseData });
  } catch (error) {
    console.error('Create case error:', error);
    res.status(500).json({ error: 'Failed to create case.' });
  }
});

// POST /api/cases/:caseId/upload — Upload images for a case
router.post(
  '/:caseId/upload',
  (req, res, next) => {
    // Set caseId on params for multer destination
    next();
  },
  upload.fields([
    { name: 'images', maxCount: 20 },
    { name: 'supportImages', maxCount: 20 },
    { name: 'supportLabels', maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const caseData = await Case.findOne({
        _id: req.params.caseId,
        radiologistId: req.userId,
      });
      if (!caseData) {
        return res.status(404).json({ error: 'Case not found.' });
      }

      // Store file paths
      if (req.files.images) {
        caseData.originalImages = req.files.images.map((f) => f.path);
      }
      if (req.files.supportImages) {
        caseData.supportImages = req.files.supportImages.map((f) => f.path);
      }
      if (req.files.supportLabels) {
        caseData.supportLabels = req.files.supportLabels.map((f) => f.path);
      }

      caseData.status = 'uploading';
      await caseData.save();

      res.json({ message: 'Files uploaded', case: caseData });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload files.' });
    }
  }
);

// POST /api/cases/:caseId/segment — Run segmentation
router.post('/:caseId/segment', async (req, res) => {
  try {
    const caseData = await Case.findOne({
      _id: req.params.caseId,
      radiologistId: req.userId,
    });
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found.' });
    }

    if (!caseData.originalImages || caseData.originalImages.length === 0) {
      return res.status(400).json({ error: 'No images uploaded for this case.' });
    }

    // Update status
    caseData.status = 'processing';
    await caseData.save();

    try {
      // Create output directory for masks
      const maskDir = path.join(UPLOAD_DIR, 'masks', req.params.caseId);
      fs.mkdirSync(maskDir, { recursive: true });

      const result = await runSegmentation(
        caseData.originalImages,
        caseData.supportImages || [],
        caseData.supportLabels || []
      );

      caseData.segmentedImages = result.mask_paths || [];
      caseData.status = 'completed';
      await caseData.save();

      res.json({ message: 'Segmentation complete', case: caseData });
    } catch (mlError) {
      caseData.status = 'error';
      caseData.errorMessage = mlError.message;
      await caseData.save();
      res.status(500).json({ error: mlError.message });
    }
  } catch (error) {
    console.error('Segment error:', error);
    res.status(500).json({ error: 'Segmentation failed.' });
  }
});

// GET /api/cases — List all cases for the logged-in radiologist
router.get('/', async (req, res) => {
  try {
    const cases = await Case.find({ radiologistId: req.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ cases });
  } catch (error) {
    console.error('List cases error:', error);
    res.status(500).json({ error: 'Failed to fetch cases.' });
  }
});

// GET /api/cases/:caseId — Get a single case
router.get('/:caseId', async (req, res) => {
  try {
    const caseData = await Case.findOne({
      _id: req.params.caseId,
      radiologistId: req.userId,
    });
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found.' });
    }
    res.json({ case: caseData });
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({ error: 'Failed to fetch case.' });
  }
});

// DELETE /api/cases/:caseId — Delete a case and its files
router.delete('/:caseId', async (req, res) => {
  try {
    const caseData = await Case.findOne({
      _id: req.params.caseId,
      radiologistId: req.userId,
    });
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found.' });
    }

    // Clean up files
    const dirsToClean = [
      path.join(UPLOAD_DIR, 'raw', req.params.caseId),
      path.join(UPLOAD_DIR, 'masks', req.params.caseId),
      path.join(UPLOAD_DIR, 'support_sets', req.params.caseId),
    ];
    for (const dir of dirsToClean) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    await Case.findByIdAndDelete(req.params.caseId);
    res.json({ message: 'Case deleted successfully.' });
  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({ error: 'Failed to delete case.' });
  }
});

module.exports = router;
