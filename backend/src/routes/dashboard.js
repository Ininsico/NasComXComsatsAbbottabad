import { Router } from 'express';
import { listAppointments, upcoming } from '../lib/appointments.js';
import { requireAuth } from '../lib/auth.js';
import { workspaceContext } from '../lib/context.js';
import { leadStats, recoveryQueue } from '../lib/leads.js';
import { listIntents } from '../lib/payments.js';
import { canSeeValue, maskValues } from '../lib/permissions.js';
import { entitlementsFor } from '../lib/subscriptions.js';

const router = Router();

router.use(requireAuth, workspaceContext);

/**
 * The operational dashboard, assembled in one read so every figure on the page comes from
 * the same moment — a dashboard where the tiles are seconds apart from each other is a
 * dashboard that contradicts itself.
 *
 * Revenue follows the glossary: "payments received" is collected only (confirmed intents
 * minus nothing, because a refund only exists once Stripe has one), and "projected" is
 * open opportunity value plus payment requests that have not been paid.
 */
router.get('/', async (req, res) => {
  const workspaceId = req.workspace.id;
  // The spec's split: a User sees their own book, an Owner or Admin sees the company. That
  // is a server decision — the page cannot widen its own scope.
  const personal = req.member.level === 'user';
  const scope = personal ? { assigneeId: req.member.id } : {};

  const [stats, intents, entitlements, appointments, recovery] = await Promise.all([
    leadStats(workspaceId, scope),
    listIntents(),
    entitlementsFor(workspaceId),
    listAppointments(workspaceId),
    recoveryQueue(workspaceId),
  ]);

  const mine = intents.filter((intent) => intent.workspaceId === workspaceId);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Collected is money that arrived and stayed: confirmed payments this month, minus the
  // ones refunded this month. A refund made in the Stripe dashboard therefore lowers the
  // figure it previously raised, which is the only honest way to count it.
  const collectedThisMonth = mine.filter(
    (intent) =>
      ['confirmed', 'overpaid'].includes(intent.status) &&
      intent.confirmedAt &&
      intent.confirmedAt >= monthStart,
  );

  const refundedThisMonth = mine.filter(
    (intent) => intent.status === 'refunded' && intent.refundedAt && intent.refundedAt >= monthStart,
  );

  const collected =
    collectedThisMonth.reduce(
      (total, intent) => total + Number(intent.matchedTotal ?? intent.expectedAmount ?? 0),
      0,
    ) -
    refundedThisMonth.reduce(
      (total, intent) => total + Number(intent.matchedTotal ?? intent.expectedAmount ?? 0),
      0,
    );

  const awaiting = mine.filter((intent) => intent.status === 'awaiting_payment');

  const projected =
    stats.pipelineValue +
    awaiting.reduce((total, intent) => total + Number(intent.expectedAmount ?? 0), 0);

  // Money is the masked field, so every money figure on this page is withheld together —
  // a pipeline total that leaks what the individual records hide would defeat the point.
  const showValue = canSeeValue(req.permissions);

  res.json({
    workspace: { id: workspaceId, name: req.workspace.name },
    generatedAt: stats.generatedAt,
    valueHidden: !showValue,
    personal,
    scopeLabel: personal ? 'Your figures' : 'Company-wide',
    subscription: {
      planId: entitlements.subscription.planId,
      planName: entitlements.subscription.planName,
      status: entitlements.subscription.status,
      live: entitlements.live,
      reason: entitlements.reason,
      periodEnd: entitlements.subscription.currentPeriodEnd,
      limits: entitlements.limits,
    },
    leads: {
      total: stats.total,
      newToday: stats.newToday,
      weekLeads: stats.weekLeads,
      unacknowledged: stats.unacknowledged,
      overdue: stats.overdue,
      recoveryCount: stats.recoveryCount,
      escalations24h: stats.escalations24h,
      avgFirstResponseSeconds: stats.avgFirstResponseSeconds,
      acknowledgedCount: stats.acknowledgedCount,
      conversionRate: stats.conversionRate,
    },
    pipeline: {
      byStage: stats.byStage,
      stageLabels: stats.stageLabels,
      openValue: showValue ? stats.pipelineValue : null,
      wonValue: showValue ? stats.wonValue : null,
      monthWon: stats.monthWon,
    },
    revenue: {
      // Revenue is company money; a personal view does not get it.
      collectedThisMonth: personal ? null : showValue ? Math.round(collected * 100) / 100 : null,
      projected: personal ? null : showValue ? Math.round(projected * 100) / 100 : null,
      awaitingPaymentRequests: personal ? 0 : awaiting.length,
    },
    team: stats.availability,
    appointments: {
      upcoming: upcoming(appointments),
      total: appointments.length,
    },
    // The red alerts, visible in the app as well as by email: opportunities past their
    // acknowledgement deadline, worst first. This is the same data the alert centre uses.
    redAlerts: maskValues(
      (recovery.items ?? []).filter((item) => item.overdueSeconds > 0).slice(0, 5),
      req.permissions,
    ),
    recentLeads: maskValues(stats.recentLeads, req.permissions),
    recentActivities: stats.recentActivities,
  });
});

export default router;
