import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { listDocuments } from '../lib/documents.js';
import { loadPortfolio } from '../lib/portfolio.js';
import { monitoringSnapshot } from '../lib/prometheus.js';
import { listUsers } from '../lib/store.js';

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
