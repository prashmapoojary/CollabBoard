import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { AppError } from './errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store uploads in server/uploads
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed extensions and MIME types (broad set of safe formats)
const ALLOWED_EXTENSIONS = new Set([
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.tiff',
  '.tif',
  '.ico',
  '.heic',
  // Documents & PDFs
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.md',
  '.markdown',
  '.rtf',
  '.odt',
  '.ods',
  '.odp',
  // Code, Config & Data
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.sql',
  '.log',
  // Design files
  '.psd',
  '.ai',
  '.sketch',
  '.fig',
  '.xd',
  // Audio & Video
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  // Archives
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.bz2',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.msi',
  '.bin',
  '.com',
  '.scr',
  '.jar',
  '.apk',
  '.pif',
  '.php',
  '.py',
]);

// Multer disk storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${cleanBase}-${uniqueSuffix}${ext}`);
  },
});

// File filter for security
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return cb(
      new AppError(
        'Executable files and scripts are not allowed for security reasons.',
        400
      ),
      false
    );
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new AppError(
        'File type not allowed. Supported types: images, PDFs, office documents, text files, and zip archives.',
        400
      ),
      false
    );
  }

  cb(null, true);
};

// 10MB file size limit
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter,
});

/**
 * Middleware wrapper for single file upload that normalizes Multer errors into AppError (HTTP 400).
 *
 * @param {string} fieldName
 */
export const uploadSingleAttachment = (fieldName = 'file') => {
  const single = upload.single(fieldName);

  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File size exceeds the 10MB limit.', 400));
          }
          return next(new AppError(`Upload error: ${err.message}`, 400));
        }
        return next(err);
      }
      next();
    });
  };
};
