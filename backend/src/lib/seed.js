import { DEMO_ACCOUNTS } from '../data/records.js';
import { hashPassword } from './auth.js';
import { createUser, findUserByEmail } from './store.js';

const DEMO_EMAILS = new Set(DEMO_ACCOUNTS.map((account) => account.email.toLowerCase()));

export const DEMO_ACCOUNT_COUNT = DEMO_ACCOUNTS.length;

export function isDemoAccount(email) {
  return DEMO_EMAILS.has(String(email ?? '').trim().toLowerCase());
}

/** How many of the demo accounts are currently present in the store. */
export async function countDemoAccounts() {
  let present = 0;

  for (const account of DEMO_ACCOUNTS) {
    if (await findUserByEmail(account.email)) present += 1;
  }

  return present;
}

/**
 * Writes the demo accounts into the user store. Safe to run repeatedly:
 * accounts that already exist are skipped.
 */
export async function seedDemoAccounts() {
  const created = [];

  for (const account of DEMO_ACCOUNTS) {
    const existing = await findUserByEmail(account.email);
    if (existing) continue;

    const passwordHash = await hashPassword(account.password);
    const user = await createUser({
      name: account.name,
      email: account.email,
      passwordHash,
      role: account.role,
    });

    created.push({ email: user.email, role: user.role });
  }

  return created;
}
