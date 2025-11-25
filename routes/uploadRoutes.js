const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const auth = require('../middleware/auth');

// Cloudinary config (env vars MUST be set)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer: memory only (NO local files)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    const isValid = allowedTypes.test(ext) && allowedTypes.test(file.mimetype);
    if (!isValid) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      console.log('[UPLOAD] No file received');
      return res.status(400).json({ message: 'No image uploaded' });
    }

    console.log('[UPLOAD] Starting Cloudinary upload for file:', req.file.originalname);

    // Upload to Cloudinary from memory buffer
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'chat_images', // Your folder in Cloudinary dashboard
          transformation: [
            { width: 1000, height: 1000, crop: 'limit' }, // Resize for perf
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('[UPLOAD ERROR] Cloudinary failed:', error.message);
            reject(error);
          } else {
            console.log('[UPLOAD SUCCESS] Cloudinary URL:', result.secure_url);
            resolve(result);
          }
        }
      );
      stream.end(req.file.buffer);
    });

    const url = result.secure_url; // This is the Cloudinary URL for DB
    res.json({ url });
  } catch (error) {
    console.error('[UPLOAD ERROR] Full error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

module.exports = router;