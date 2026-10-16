import { DEMO_ACCOUNTS } from '../data/records.js';
import { hashPassword } from './auth.js';
import { createUser, findUserByEmail } from './store.js';

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
