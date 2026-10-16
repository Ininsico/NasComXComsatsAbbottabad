import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const dbFile = join(dataDir, 'profiles.json');

/** Fields a member can fill in, in the order they appear on the profile page. */
export const PROFILE_FIELDS = [
  'phone',
  'dateOfBirth',
  'address',
  'city',
  'guardianName',
  'guardianPhone',
  'programme',
  'section',
  'bio',
];

const MAX_LENGTHS = {
  phone: 24,
  dateOfBirth: 10,
  address: 160,
  city: 80,
  guardianName: 80,
  guardianPhone: 24,
  programme: 80,
  section: 20,
  bio: 400,
};

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

async function writeAll(profiles) {
  await mkdir(dataDir, { recursive: true });
  const tmpFile = join(dataDir, `.profiles.${randomUUID()}.tmp`);
  await writeFile(tmpFile, `${JSON.stringify(profiles, null, 2)}\n`, 'utf8');
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

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Validates the editable profile fields and returns only accepted values. */
export function validateProfile(input = {}) {
  const errors = {};
  const values = {};

  for (const field of PROFILE_FIELDS) {
    const value = clean(input[field]);

    if (value.length > MAX_LENGTHS[field]) {
      errors[field] = `Keep this under ${MAX_LENGTHS[field]} characters`;
      continue;
    }

    values[field] = value;
  }

  if (values.phone && !/^[+()\d][\d\s()+-]{5,}$/.test(values.phone)) {
    errors.phone = 'Enter a valid phone number';
  }

  if (values.guardianPhone && !/^[+()\d][\d\s()+-]{5,}$/.test(values.guardianPhone)) {
    errors.guardianPhone = 'Enter a valid phone number';
  }

  if (values.dateOfBirth) {
    const parsed = Date.parse(values.dateOfBirth);

    if (Number.isNaN(parsed)) {
      errors.dateOfBirth = 'Use a valid date';
    } else if (parsed > Date.now()) {
      errors.dateOfBirth = 'Date of birth cannot be in the future';
    }
  }

  return { errors, values };
}

export async function getProfile(userId) {
  const profiles = await readAll();
  const found = profiles.find((profile) => profile.userId === userId);

  if (found) return found;

  return {
    userId,
    ...Object.fromEntries(PROFILE_FIELDS.map((field) => [field, ''])),
    avatarUrl: null,
    updatedAt: null,
  };
}

export async function saveProfile(userId, values) {
  return withLock(async () => {
    const profiles = await readAll();
    const index = profiles.findIndex((profile) => profile.userId === userId);
    const existing = index === -1 ? { avatarUrl: null } : profiles[index];

    const updated = {
      ...existing,
      ...values,
      userId,
      updatedAt: new Date().toISOString(),
    };

    if (index === -1) profiles.push(updated);
    else profiles[index] = updated;

    await writeAll(profiles);
    return updated;
  });
}

export async function saveAvatar(userId, avatarUrl) {
  return withLock(async () => {
    const profiles = await readAll();
    const index = profiles.findIndex((profile) => profile.userId === userId);
    const existing = index === -1 ? {} : profiles[index];

    const updated = { ...existing, userId, avatarUrl, updatedAt: new Date().toISOString() };

    if (index === -1) profiles.push(updated);
    else profiles[index] = updated;

    await writeAll(profiles);
    return updated;
  });
}

/** How complete a profile is, counting only the fields a member controls. */
export function profileCompleteness(profile) {
  const tracked = ['phone', 'dateOfBirth', 'address', 'city', 'guardianName', 'bio'];
  const filled = tracked.filter((field) => clean(profile?.[field]).length > 0).length;
  const hasAvatar = Boolean(profile?.avatarUrl);
  const total = tracked.length + 1;
  const done = filled + (hasAvatar ? 1 : 0);

  return {
    percentage: Math.round((done / total) * 100),
    done,
    total,
    missing: [
      ...tracked.filter((field) => !clean(profile?.[field])).map((field) =>
        field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      ),
      ...(hasAvatar ? [] : ['Profile photo']),
    ],
  };
}

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Resolve a WhatsApp number to a member, so their messages land in their own
 * vector space. Matching uses the last 10 digits, which tolerates country-code
 * and formatting differences between a profile and a WhatsApp sender id.
 */
export async function findProfileByPhone(phone) {
  const needle = digitsOf(phone);

  if (needle.length < 7) return null;

  const profiles = await readAll();

  for (const profile of profiles) {
    const candidate = digitsOf(profile.phone);

    if (candidate.length < 7) continue;

    const compare = Math.min(candidate.length, needle.length, 10);

    if (candidate.slice(-compare) === needle.slice(-compare)) return profile;
  }

  return null;
}
