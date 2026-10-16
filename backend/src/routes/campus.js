import { Router } from 'express';
import { ANNOUNCEMENTS, FACULTY, PROGRAMS } from '../data/campus.js';

const router = Router();

router.get('/programs', (req, res) => {
  res.json({ programs: PROGRAMS });
});

router.get('/faculty', (req, res) => {
  res.json({ faculty: FACULTY });
});

router.get('/announcements', (req, res) => {
  const announcements = [...ANNOUNCEMENTS].sort((a, b) => b.date.localeCompare(a.date));
  res.json({ announcements });
});

export default router;
