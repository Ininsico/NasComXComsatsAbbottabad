import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const dbFile = join(dataDir, 'users.json');

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

async function writeAll(users) {
  await mkdir(dataDir, { recursive: true });
  const tmpFile = join(dataDir, `.users.${randomUUID()}.tmp`);
  await writeFile(tmpFile, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
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

export async function findUserByEmail(email) {
  const users = await readAll();
  const needle = email.trim().toLowerCase();
  return users.find((user) => user.email === needle) ?? null;
}

export async function findUserById(id) {
  const users = await readAll();
  return users.find((user) => user.id === id) ?? null;
}

/** Every account, with password hashes stripped. */
export async function listUsers() {
  const users = await readAll();
  return users.map(toPublicUser);
}

/** Apply a partial update to one account (used by the profile page for the name). */
export async function updateUser(id, patch) {
  return withLock(async () => {
    const users = await readAll();
    const index = users.findIndex((user) => user.id === id);

    if (index === -1) return null;

    users[index] = { ...users[index], ...patch, id: users[index].id };
    await writeAll(users);
    return toPublicUser(users[index]);
  });
}

export async function createUser({ name, email, passwordHash, role }) {
  return withLock(async () => {
    const users = await readAll();
    const normalizedEmail = email.trim().toLowerCase();

    if (users.some((user) => user.email === normalizedEmail)) {
      const error = new Error('An account with this email already exists');
      error.status = 409;
      throw error;
    }

    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    };

    users.push(user);
    await writeAll(users);
    return user;
  });
}

export function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}
