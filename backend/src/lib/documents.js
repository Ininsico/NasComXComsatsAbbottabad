import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const dbFile = join(dataDir, 'documents.json');

if (config.cloudinary.configured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

let writeQueue = Promise.resolve();

async function readAll() {
  try {
    const raw = await readFile(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(records) {
  await mkdir(dataDir, { recursive: true });
  const tmpFile = join(dataDir, `.documents.${randomUUID()}.tmp`);
  await writeFile(tmpFile, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  await rename(tmpFile, dbFile);
}

function withLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function listDocuments() {
  const records = await readAll();
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createDocument({ owner, title, originalName, mimeType, bytes, asset }) {
  return withLock(async () => {
    const records = await readAll();

    const record = {
      id: randomUUID(),
      title,
      originalName,
      mimeType,
      bytes,
      url: asset.secure_url,
      publicId: asset.public_id,
      resourceType: asset.resource_type ?? 'image',
      format: asset.format ?? null,
      ownerId: owner.id,
      ownerName: owner.name,
      ownerEmail: owner.email,
      ownerRole: owner.role,
      createdAt: new Date().toISOString(),
    };

    records.push(record);
    await writeAll(records);
    return record;
  });
}

export async function deleteDocument(id) {
  return withLock(async () => {
    const records = await readAll();
    const index = records.findIndex((record) => record.id === id);

    if (index === -1) return null;

    const [removed] = records.splice(index, 1);
    await writeAll(records);
    return removed;
  });
}

export function uploadToCloudinary(buffer, { filename, ownerEmail }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: config.cloudinary.folder,
        resource_type: 'auto',
        filename,
        use_filename: true,
        unique_filename: true,
        context: { uploader: ownerEmail },
      },
      (error, result) => {
        if (error) {
          reject(new Error(error.message ?? 'Cloudinary rejected the upload'));
          return;
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}

export async function destroyFromCloudinary(publicId, resourceType = 'image') {
  if (!config.cloudinary.configured) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
