import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
import { uploadToCloudinary } from '../lib/documents.js';
import {
  getProfile,
  profileCompleteness,
  saveAvatar,
  saveProfile,
  validateProfile,
} from '../lib/profiles.js';
import { updateUser } from '../lib/store.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.cloudinary.maxUploadBytes },
});

/** A member's own record: what they can edit, and how complete it is. */

function receiveAvatar(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `Images must be ${Math.round(config.cloudinary.maxUploadBytes / 1024 / 1024)} MB or smaller`
        : error.message;

    res.status(400).json({ error: message });
  });
}

router.get('/', requireAuth, async (req, res) => {
  const profile = await getProfile(req.user.id);

  res.json({
    user: req.user,
    profile,
    completeness: profileCompleteness(profile),
    avatarUploads: config.cloudinary.configured,
  });
});

router.put('/', requireAuth, async (req, res) => {
  const { errors, values } = validateProfile(req.body ?? {});
  const name = String(req.body?.name ?? req.user.name).trim();

  if (name.length < 2 || name.length > 80) {
    errors.name = 'Enter your full name (2 to 80 characters)';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
  }

  let user = req.user;

  if (name !== req.user.name) {
    user = (await updateUser(req.user.id, { name })) ?? req.user;
  }

  const profile = await saveProfile(req.user.id, values);

  return res.json({
    user,
    profile,
    completeness: profileCompleteness(profile),
  });
});

router.post('/avatar', requireAuth, receiveAvatar, async (req, res) => {
  if (!config.cloudinary.configured) {
    return res.status(503).json({ error: 'Image storage is not configured on the server' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Choose an image to upload' });
  }

  if (!String(req.file.mimetype).startsWith('image/')) {
    return res.status(400).json({ error: 'Profile photos must be an image file' });
  }

  const asset = await uploadToCloudinary(req.file.buffer, {
    filename: req.file.originalname,
    ownerEmail: req.user.email,
  });

  const profile = await saveAvatar(req.user.id, asset.secure_url);

  return res.status(201).json({ profile, avatarUrl: asset.secure_url });
});

export default router;
