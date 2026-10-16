import { Router } from 'express';
import { hashPassword, issueToken, requireAuth, verifyPassword } from '../lib/auth.js';
import { isDemoAccount, seedDemoAccounts } from '../lib/seed.js';
import { createUser, findUserByEmail, toPublicUser } from '../lib/store.js';
import { validateLogin, validateSignup } from '../lib/validate.js';

const router = Router();

/**
 * The demo accounts are written on boot, but a freshly deployed or emptied
 * store would otherwise reject the published demo credentials. Re-running the
 * seed is idempotent, so this self-heals instead of failing the sign-in.
 */
async function ensureDemoAccounts() {
  try {
    await seedDemoAccounts();
  } catch {
    // A concurrent request seeded first — the lookup that follows settles it.
  }
}

router.post('/signup', async (req, res) => {
  const { name, email, password, role } = req.body ?? {};
  const errors = validateSignup({ name, email, password, role });

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
  }

  const user = await createUser({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: role ?? 'student',
  });

  return res.status(201).json({
    token: issueToken(user),
    user: toPublicUser(user),
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const errors = validateLogin({ email, password });

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
  }

  let user = await findUserByEmail(email);

  if (!user && isDemoAccount(email)) {
    await ensureDemoAccounts();
    user = await findUserByEmail(email);
  }

  const passwordMatches = user && (await verifyPassword(password, user.passwordHash));

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  return res.json({
    token: issueToken(user),
    user: toPublicUser(user),
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
