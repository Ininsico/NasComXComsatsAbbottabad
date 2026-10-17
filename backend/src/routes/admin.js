import { Router } from 'express';
import { config } from '../config.js';
import { ANNOUNCEMENTS, FACULTY, PROGRAMS } from '../data/campus.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { listDocuments } from '../lib/documents.js';
import { listStudentSummaries } from '../lib/overview.js';
import { loadPortfolio } from '../lib/portfolio.js';
import { monitoringSnapshot } from '../lib/prometheus.js';
import { listUsers } from '../lib/store.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (values) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

/**
 * Live platform health for the admin dashboard, read from Prometheus.
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
  const users = await listUsers();
  const documents = await listDocuments();
  const students = await listStudentSummaries();
  const portfolio = await loadPortfolio();

  const byRole = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] ?? 0) + 1;
    return acc;
  }, {});

  const totalBytes = documents.reduce((total, doc) => total + (doc.bytes ?? 0), 0);
  const outstanding = students.filter((student) => student.feeDue > 0);

  res.json({
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      students: byRole.student ?? 0,
      parents: byRole.parent ?? 0,
      facultyAccounts: byRole.faculty ?? 0,
      admins: byRole.admin ?? 0,
      documents: documents.length,
      programmes: PROGRAMS.length,
      facultyMembers: FACULTY.length,
      announcements: ANNOUNCEMENTS.length,
      trackedStudents: students.length,
    },
    storage: {
      bytes: totalBytes,
      megabytes: round(totalBytes / 1024 / 1024, 2),
    },
    academics: {
      averageCgpa: round(average(students.map((student) => student.cgpa))),
      averageAttendance: Math.round(average(students.map((student) => student.attendance))),
      outstandingCount: outstanding.length,
      outstandingTotal: outstanding.reduce((total, student) => total + student.feeDue, 0),
    },
    integrations: {
      cloudinary: config.cloudinary.configured,
      groq: config.groq.configured,
      binance: config.binance.configured,
    },
    portfolio,
    users: [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    documents,
    students,
    announcements: ANNOUNCEMENTS,
  });
});

export default router;
