/**
 * Create the first owner for a deployment.
 *
 * Sign-up is Google-only, so a fresh install has nobody who can get in and configure it.
 * This is the explicit way in, run once by whoever operates the deployment — it is not a
 * seed and it invents nothing: you name the address, and it creates that account plus its
 * workspace as Owner. Running it again for the same address is a no-op.
 *
 *   npm --prefix backend run owner:create -- --email you@company.com --name "Your Name"
 *
 * The password is only used if you later want the password form on the sign-in page; with
 * Google configured, signing in with Google is enough.
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../lib/auth.js';
import { ensureWorkspaceForUser } from '../lib/context.js';
import { createUser, findUserByEmail, listUsers, toPublicUser } from '../lib/store.js';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);

  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const email = String(argument('email') ?? '').trim().toLowerCase();
const name = String(argument('name') ?? '').trim() || email.split('@')[0];
const password = argument('password') ?? randomUUID().replace(/-/g, '').slice(0, 20);

if (!email) {
  console.error('Usage: npm --prefix backend run owner:create -- --email you@company.com [--name "Your Name"]');
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`That does not look like an email address: ${email}`);
  process.exit(1);
}

let user = await findUserByEmail(email);

if (user) {
  console.log(`${email} already exists — no account was created.`);
} else {
  user = await createUser({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
  });

  console.log(`Created ${email}.`);
}

const { workspace, member } = await ensureWorkspaceForUser(user, {
  workspaceName: `${user.name}'s workspace`,
});

console.log(`Workspace: ${workspace.name} (${workspace.id})`);
console.log(`Membership: ${member.level}`);
console.log('');
console.log('Sign in with Google using that address, or with the password form using:');
console.log(`  password: ${password}`);
console.log('');
console.log(`Accounts on this deployment: ${(await listUsers()).length}`);
console.log(`Public shape: ${JSON.stringify(toPublicUser(user))}`);
