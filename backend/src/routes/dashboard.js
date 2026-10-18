import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { workspaceContext } from '../lib/context.js';
import { leadStats } from '../lib/leads.js';
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

  const [stats, intents, entitlements] = await Promise.all([
    leadStats(workspaceId),
    listIntents(),
    entitlementsFor(workspaceId),
  ]);

  const mine = intents.filter((intent) => intent.workspaceId === workspaceId);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const collected = mine
    .filter((intent) => intent.confirmedAt && intent.confirmedAt >= monthStart)
    .reduce((total, intent) => total + Number(intent.matchedTotal ?? intent.expectedAmount ?? 0), 0);

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
      collectedThisMonth: showValue ? Math.round(collected * 100) / 100 : null,
      projected: showValue ? Math.round(projected * 100) / 100 : null,
      awaitingPaymentRequests: awaiting.length,
    },
    team: stats.availability,
    recentLeads: maskValues(stats.recentLeads, req.permissions),
    recentActivities: stats.recentActivities,
  });
});

export default router;
