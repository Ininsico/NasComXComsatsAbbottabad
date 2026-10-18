import { config } from '../config.js';
import { hashPassword } from './auth.js';
import { ensureWorkspaceForUser } from './context.js';
import { createUser, findUserByEmail } from './store.js';

/**
 * The administrator behind the instant-login button.
 *
 * This is not a seed: nothing is created unless INSTANT_LOGIN is switched on and an email
 * and password are supplied in the environment. When they are, this makes sure that one
 * account exists, as an administrator, owning a workspace — so the button on the sign-in
 * page has something real to sign into.
 *
 * Turning INSTANT_LOGIN off removes the button and the endpoint; the account stays and can
 * still be signed into with its password.
 */
export async function ensureBootstrapAdmin() {
  if (!config.instantLogin.enabled) return null;

  const email = config.instantLogin.adminEmail;
  const password = config.instantLogin.adminPassword;

  if (!email || !password) {
    console.warn(
      '[instant-login] INSTANT_LOGIN is on but BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are not both set — the button stays off.',
    );
    return null;
  }

  let user = await findUserByEmail(email);
  const created = !user;

  if (!user) {
    user = await createUser({
      name: config.instantLogin.adminName || 'Administrator',
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
    });
  } else if (user.role !== 'admin') {
    // An existing account promoted by configuration, not by a hidden side effect.
    const { updateUser } = await import('./store.js');
    user = (await updateUser(user.id, { role: 'admin' })) ?? user;
  }

  const { workspace, member } = await ensureWorkspaceForUser(user, {
    workspaceName: 'Nascom Demo',
  });

  if (created) {
    console.log(`[instant-login] created ${email} as an administrator of "${workspace.name}"`);
  }

  return { user, workspace, member, created };
}
