import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import {
  logoutWhatsApp,
  sendWhatsAppMessage,
  startWhatsApp,
  stopWhatsApp,
  whatsappStatus,
} from '../lib/whatsapp.js';

const router = Router();

router.use(requireAuth, workspaceContext);

/**
 * The deployment's own number, used by the public website's auto-reply. Deliberately
 * outside the workspace permission gate: it belongs to the platform, not to a tenant.
 */
router.get('/main', requireRole('admin'), (req, res) => {
  res.json(whatsappStatus('main'));
});

router.use(requirePermission('integrations.manage'));

/** Everything below acts on the caller's own workspace. */
router.get('/status', (req, res) => {
  res.json(whatsappStatus(req.workspace.id));
});

router.post('/start', async (req, res) => {
  try {
    return res.json(await startWhatsApp(req.workspace.id));
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  res.json(await stopWhatsApp(req.workspace.id));
});

/** Forget this workspace's session; the next start needs a fresh scan. */
router.post('/logout', async (req, res) => {
  res.json(await logoutWhatsApp(req.workspace.id));
});

router.post('/send', async (req, res) => {
  const to = String(req.body?.to ?? '').trim();
  const text = String(req.body?.text ?? '').trim();

  if (!to) return res.status(400).json({ error: 'Provide a phone number in international format' });
  if (text.length < 1) return res.status(400).json({ error: 'Provide a message' });

  try {
    const sent = await sendWhatsAppMessage(req.workspace.id, to, text.slice(0, 4000));
    return res.status(201).json(sent);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

export default router;
