import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { PARENT_LINKS } from '../data/records.js';
import { requireAuth } from '../lib/auth.js';
import {
  createDocument,
  deleteDocument,
  destroyFromCloudinary,
  listDocuments,
  uploadToCloudinary,
} from '../lib/documents.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.cloudinary.maxUploadBytes },
});

/** Students hand work in; faculty and admins can publish too. Parents are read-only. */
const CAN_UPLOAD = new Set(['student', 'faculty', 'admin']);

function scopeFor(user, documents) {
  if (user.role === 'student') {
    return { documents: documents.filter((doc) => doc.ownerId === user.id), scope: 'own' };
  }

  if (user.role === 'parent') {
    const wards = PARENT_LINKS[user.email] ?? [];
    return {
      documents: documents.filter((doc) => wards.includes(doc.ownerEmail)),
      scope: 'wards',
    };
  }

  return { documents, scope: 'all' };
}

function receiveUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `Files must be ${Math.round(config.cloudinary.maxUploadBytes / 1024 / 1024)} MB or smaller`
        : error.message;

    res.status(400).json({ error: message });
  });
}

router.get('/', requireAuth, async (req, res) => {
  const { documents, scope } = scopeFor(req.user, await listDocuments());

  res.json({
    documents,
    scope,
    canUpload: CAN_UPLOAD.has(req.user.role),
    storageConfigured: config.cloudinary.configured,
  });
});

router.post('/', requireAuth, receiveUpload, async (req, res) => {
  if (!CAN_UPLOAD.has(req.user.role)) {
    return res.status(403).json({ error: 'Your account type cannot upload documents' });
  }

  if (!config.cloudinary.configured) {
    return res.status(503).json({ error: 'File storage is not configured on the server' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Attach a file to upload' });
  }

  const title = String(req.body?.title ?? '').trim() || req.file.originalname;

  const asset = await uploadToCloudinary(req.file.buffer, {
    filename: req.file.originalname,
    ownerEmail: req.user.email,
  });

  const document = await createDocument({
    owner: req.user,
    title,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    bytes: req.file.size,
    asset,
  });

  return res.status(201).json({ document });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const documents = await listDocuments();
  const target = documents.find((doc) => doc.id === req.params.id);

  if (!target) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const isOwner = target.ownerId === req.user.id;
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only remove your own documents' });
  }

  await deleteDocument(target.id);

  try {
    await destroyFromCloudinary(target.publicId, target.resourceType);
  } catch {
    // Metadata is already gone; a stale remote asset is not worth failing on.
  }

  return res.json({ removed: target.id });
});

export default router;
