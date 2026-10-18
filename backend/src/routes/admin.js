import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { hashPassword, requireAuth, requireRole } from '../lib/auth.js';
import { ensureWorkspaceForUser } from '../lib/context.js';
import { db } from '../lib/db.js';
import { listDocuments } from '../lib/documents.js';
import { loadPortfolio } from '../lib/portfolio.js';
import { monitoringSnapshot } from '../lib/prometheus.js';
import { createUser, findUserByEmail, listUsers, toPublicUser, updateUser } from '../lib/store.js';

const router = Router();

/**
 * The platform console: the deployment operator's view, not a workspace's. Everything here
 * is read from stored records. A tenant's own figures belong on the workspace dashboard,
 * so none of them are duplicated on this page.
 */
router.use(requireAuth, requireRole('admin'));

const megabytes = (bytes) => Math.round((bytes / 1024 / 1024) * 100) / 100;

/**
 * Live platform health, read from Prometheus.
 *
 * Deliberately a fixed set of queries (see lib/prometheus.js) rather than a passthrough,
 * so this endpoint cannot be used to run arbitrary PromQL.
 */
router.get('/metrics', async (req, res) => {
  try {
    return res.json(await monitoringSnapshot());
  } catch (error) {
    return res.status(503).json({ available: false, reason: error.message, series: {}, instant: {} });
  }
});

/**
 * People. The platform console is where accounts are created and their role is set — a
 * workspace owner invites people to a workspace, but only the operator of the deployment
 * decides who exists at all.
 *
 * Passwords are never returned from this list; a new account's generated password is shown
 * once, at creation, because the operator has to hand it over.
 */
router.get('/users', async (req, res) => {
  const [users, members, workspaces] = await Promise.all([
    listUsers(),
    db.collection('members').read(),
    db.collection('workspaces').read(),
  ]);

  const workspaceName = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  const membership = new Map(members.map((member) => [member.userId, member]));

  res.json({
    users: users
      .map((user) => {
        const join = membership.get(user.id);
        const { passwordHash, ...rest } = user;

        return {
          ...rest,
          passwordSet: Boolean(passwordHash),
          member: join
            ? {
                level: join.level,
                status: join.status ?? (join.available === false ? 'offline' : 'available'),
                workspaceName: workspaceName.get(join.workspaceId) ?? null,
              }
            : null,
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email)),
    roles: ['admin', 'user'],
  });
});

router.post('/users', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role = req.body?.role === 'admin' ? 'admin' : 'user';
  const generated = req.body?.password ? null : `Nx-${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const password = String(req.body?.password ?? generated);

  if (name.length < 2) return res.status(400).json({ error: 'Enter a name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 8) return res.status(400).json({ error: 'Passwords need at least 8 characters' });

  if (await findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const user = await createUser({ name, email, passwordHash: await hashPassword(password), role });

  // A new account gets its own workspace as Owner, so it is usable immediately. A workspace
  // owner can then be invited elsewhere through the normal invite flow.
  const { workspace } = await ensureWorkspaceForUser(user, { workspaceName: `${user.name}'s workspace` });

  return res.status(201).json({
    user: toPublicUser(user),
    password: generated,
    workspace: { id: workspace.id, name: workspace.name },
  });
});

router.patch('/users/:id', async (req, res) => {
  const role = req.body?.role;

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or user' });
  }

  if (req.params.id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own administrator role' });
  }

  const updated = await updateUser(req.params.id, { role });

  if (!updated) return res.status(404).json({ error: 'No such account' });

  return res.json({ user: toPublicUser(updated) });
});

router.get('/overview', async (req, res) => {
  const [users, documents, portfolio, workspaces, members, opportunities, activities, audit] =
    await Promise.all([
      listUsers(),
      listDocuments(),
      loadPortfolio(),
      db.collection('workspaces').read(),
      db.collection('members').read(),
      db.collection('leads').read(),
      db.collection('activities').read(),
      db.collection('audit').read(),
    ]);

  const byRole = users.reduce((accumulator, user) => {
    accumulator[user.role] = (accumulator[user.role] ?? 0) + 1;
    return accumulator;
  }, {});

  const totalBytes = documents.reduce((total, document) => total + (document.bytes ?? 0), 0);

  res.json({
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      admins: byRole.admin ?? 0,
      regularUsers: byRole.user ?? 0,
      documents: documents.length,
      workspaces: workspaces.length,
      members: members.length,
      opportunities: opportunities.length,
      activities: activities.length,
      auditedActions: audit.length,
    },
    storage: {
      bytes: totalBytes,
      megabytes: megabytes(totalBytes),
    },
    integrations: {
      cloudinary: config.cloudinary.configured,
      groq: config.groq.configured,
      binance: config.binance.configured,
      stripe: config.stripe.configured,
      google: Boolean(config.google.clientId && config.google.clientSecret),
    },
    portfolio,
    users: [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    documents,
  });
});

export default router;
