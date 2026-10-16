import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import {
  logoutWhatsApp,
  sendWhatsAppMessage,
  startWhatsApp,
  stopWhatsApp,
  whatsappStatus,
} from '../lib/whatsapp.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/status', (req, res) => {
  res.json(whatsappStatus());
});

router.post('/start', async (req, res) => {
  try {
    const status = await startWhatsApp();
    return res.json(status);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  res.json(await stopWhatsApp());
});

/** Forget the stored session; the next start needs a fresh scan. */
router.post('/logout', async (req, res) => {
  res.json(await logoutWhatsApp());
});

router.post('/send', async (req, res) => {
  const to = String(req.body?.to ?? '').trim();
  const text = String(req.body?.text ?? '').trim();

  if (!to) return res.status(400).json({ error: 'Provide a phone number in international format' });
  if (text.length < 1) return res.status(400).json({ error: 'Provide a message' });

  try {
    const sent = await sendWhatsAppMessage(to, text.slice(0, 4000));
    return res.status(201).json(sent);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

export default router;
