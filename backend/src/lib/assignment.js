/**
 * Assignment and escalation targeting.
 *
 * All of this is pure: it takes the member rows, the open-lead counts and the workspace
 * settings, and returns a decision. That keeps the fairness rules testable without a
 * database, a clock or a network.
 */

export const ASSIGNABLE = new Set(['owner', 'admin', 'user']);

/** A member may take another lead when available and under their own limit. */
export function canTakeLead(member, openCounts, settings) {
  if (!member.available) return false;
  if (!ASSIGNABLE.has(member.level)) return false;

  const limit = member.openLeadLimit ?? settings.maxOpenLeads;
  const open = openCounts[member.id] ?? 0;

  return open < limit;
}

/**
 * Round-robin, implemented as "whoever was assigned longest ago".
 *
 * That is fair without storing a cursor, survives restarts, and degrades sensibly when
 * a member is added mid-week (a new member has no lastAssignedAt, so they are due).
 */
export function pickRoundRobin(members, openCounts, settings, { exclude = [], predicate } = {}) {
  const skipped = new Set(exclude);

  const candidates = members.filter(
    (member) => !skipped.has(member.id) && canTakeLead(member, openCounts, settings) && (!predicate || predicate(member)),
  );

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const left = a.lastAssignedAt ?? '';
    const right = b.lastAssignedAt ?? '';

    if (left === right) return a.name.localeCompare(b.name);

    return left < right ? -1 : 1;
  })[0];
}

/** The member a fallback step should go to, given the ladder's `to` keyword. */
export function resolveTarget(to, { members, openCounts, settings, currentAssigneeId }) {
  const exclude = currentAssigneeId ? [currentAssigneeId] : [];

  if (to === 'backup') {
    const backup = pickRoundRobin(members, openCounts, settings, {
      exclude,
      predicate: (member) => member.backup === true,
    });

    if (backup) return backup;
  }

  if (to === 'manager') {
    const manager = pickRoundRobin(members, openCounts, settings, {
      exclude,
      predicate: (member) => member.level === 'owner' || member.level === 'admin',
    });

    if (manager) return manager;
  }

  return pickRoundRobin(members, openCounts, settings, { exclude });
}

/**
 * How many escalation steps are due for a lead right now.
 *
 * Each step's `afterSeconds` is an absolute offset from the acknowledgement deadline,
 * not an interval from the previous step: answering "escalate at 30s, 60s and 120s after
 * the deadline" with 30/60/120 is what the settings say, and it does not drift.
 *
 * `level` is how many steps have already been taken, so a tick applies only new ones.
 */
export function dueSteps({ lead, settings, now = Date.now() }) {
  if (!lead.ackDeadline || lead.acknowledgedAt) return null;

  const deadline = Date.parse(lead.ackDeadline);

  if (!Number.isFinite(deadline) || now < deadline) return null;

  const ladder = settings.escalation ?? [];
  const start = Number(lead.escalationLevel ?? 0);
  const due = [];

  for (let index = start; index < ladder.length; index += 1) {
    const at = deadline + ladder[index].afterSeconds * 1000;

    if (now < at) break;

    due.push({ index, step: ladder[index] });
  }

  if (due.length === 0) return null;

  return { due, nextLevel: start + due.length };
}
