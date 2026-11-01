const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

const EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

// Configure disk storage with safe unique filenames
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // Generate 16 bytes of random hex + timestamp to avoid collisions
    const randomHash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    // Resolve extension strictly from verified mimetype
    const ext = EXTENSION_MAP[file.mimetype.toLowerCase()] || path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeFilename = `review-${timestamp}-${randomHash}${ext}`;
    cb(null, safeFilename);
  }
});

// File filter strictly enforcing allowed formats
const fileFilter = (req, file, cb) => {
  const mimeType = file.mimetype.toLowerCase();
  const ext = path.extname(file.originalname).toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  if (ALLOWED_MIME_TYPES.has(mimeType) && validExtensions.includes(ext)) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// 5 MB limit
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: fileFilter
});

// Wrapper middleware to gracefully handle Multer errors (file too large, invalid format, etc.)
const handleUpload = (fieldName = 'photo') => {
  const uploader = upload.single(fieldName);

  return (req, res, next) => {
    uploader(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File too large. Maximum allowed image size is 5 MB.'
          });
        }
        if (err.code === 'INVALID_FILE_TYPE') {
          return res.status(400).json({
            success: false,
            error: err.message
          });
        }
        if (err instanceof multer.MulterError) {
          return res.status(400).json({
            success: false,
            error: `Upload error: ${err.message}`
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message || 'Error uploading file.'
        });
      }
      next();
    });
  };
};

module.exports = {
  upload,
  handleUpload,
  UPLOADS_DIR,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES
};
