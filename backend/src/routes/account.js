import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { buildOverview } from '../lib/overview.js';

const router = Router();

router.get('/overview', requireAuth, async (req, res) => {
  res.json(await buildOverview(req.user));
});

export default router;
