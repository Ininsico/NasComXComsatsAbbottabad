import assert from 'node:assert/strict';
import test from 'node:test';
import { canTakeLead, dueSteps, pickRoundRobin, resolveTarget } from '../src/lib/assignment.js';

/**
 * The rules the product promises: fair round-robin, respect for open-lead limits, and
 * an escalation ladder that fires on time. All pure, so all testable.
 */

const settings = {
  maxOpenLeads: 3,
  acknowledgeSeconds: 60,
  escalation: [
    { afterSeconds: 30, to: 'next' },
    { afterSeconds: 60, to: 'backup' },
    { afterSeconds: 120, to: 'manager' },
  ],
};

const member = (id, overrides = {}) => ({
  id,
  name: id.toUpperCase(),
  level: 'user',
  available: true,
  openLeadLimit: null,
  lastAssignedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('a member may take a lead when available and under the limit', () => {
  assert.equal(canTakeLead(member('a'), {}, settings), true);
  assert.equal(canTakeLead(member('a'), { a: 2 }, settings), true);
});

test('the workspace limit stops a member at the boundary', () => {
  assert.equal(canTakeLead(member('a'), { a: 3 }, settings), false);
});

test('a per-member limit overrides the workspace default', () => {
  const limited = member('a', { openLeadLimit: 1 });

  assert.equal(canTakeLead(limited, { a: 1 }, settings), false);
  assert.equal(canTakeLead(limited, { a: 0 }, settings), true);
});

test('unavailable members are never chosen', () => {
  assert.equal(canTakeLead(member('a', { available: false }), {}, settings), false);
});

test('round-robin picks whoever was assigned longest ago', () => {
  const members = [
    member('a', { lastAssignedAt: '2026-01-02T00:00:00.000Z' }),
    member('b', { lastAssignedAt: '2026-01-01T00:00:00.000Z' }),
    member('c', { lastAssignedAt: '2026-01-03T00:00:00.000Z' }),
  ];

  assert.equal(pickRoundRobin(members, {}, settings).id, 'b');
});

test('a new member with no history is due first', () => {
  const members = [
    member('a', { lastAssignedAt: '2026-01-05T00:00:00.000Z' }),
    member('b', { lastAssignedAt: null }),
  ];

  assert.equal(pickRoundRobin(members, {}, settings).id, 'b');
});

test('round-robin skips members at their limit and anyone excluded', () => {
  const members = [member('a'), member('b'), member('c')];

  const picked = pickRoundRobin(members, { a: 3 }, settings, { exclude: ['b'] });

  assert.equal(picked.id, 'c');
});

test('nobody is chosen when everyone is full', () => {
  const members = [member('a'), member('b')];

  assert.equal(pickRoundRobin(members, { a: 3, b: 3 }, settings), null);
});

test('the backup step prefers the flagged backup member', () => {
  const members = [member('a'), member('b', { backup: true }), member('c', { level: 'admin' })];

  const target = resolveTarget('backup', {
    members,
    openCounts: {},
    settings,
    currentAssigneeId: 'a',
  });

  assert.equal(target.id, 'b');
});

test('the manager step picks an owner or admin', () => {
  const members = [member('a'), member('b'), member('c', { level: 'admin' })];

  const target = resolveTarget('manager', {
    members,
    openCounts: {},
    settings,
    currentAssigneeId: 'a',
  });

  assert.equal(target.id, 'c');
});

test('the next step falls through when no backup exists', () => {
  const members = [member('a'), member('b')];

  const target = resolveTarget('backup', {
    members,
    openCounts: {},
    settings,
    currentAssigneeId: 'a',
  });

  assert.equal(target.id, 'b');
});

test('no escalation is due while the clock is still running', () => {
  const lead = {
    ackDeadline: new Date('2026-01-01T00:01:00.000Z').toISOString(),
    acknowledgedAt: null,
    escalationLevel: 0,
  };

  assert.equal(dueSteps({ lead, settings, now: Date.parse('2026-01-01T00:00:59.000Z') }), null);
});

test('an acknowledged lead never escalates', () => {
  const lead = {
    ackDeadline: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    acknowledgedAt: '2026-01-01T00:00:10.000Z',
    escalationLevel: 0,
  };

  assert.equal(dueSteps({ lead, settings, now: Date.parse('2026-01-02T00:00:00.000Z') }), null);
});

test('the first step fires 30s after the deadline', () => {
  const deadline = '2026-01-01T00:00:00.000Z';
  const lead = { ackDeadline: deadline, escalationLevel: 0 };

  const at = Date.parse(deadline) + 30_000;
  const result = dueSteps({ lead, settings, now: at });

  assert.equal(result.due.length, 1);
  assert.equal(result.due[0].step.to, 'next');
  assert.equal(result.nextLevel, 1);
});

test('a long-overdue lead yields every step that is due', () => {
  const deadline = '2026-01-01T00:00:00.000Z';
  const lead = { ackDeadline: deadline, escalationLevel: 0 };

  const result = dueSteps({ lead, settings, now: Date.parse(deadline) + 200_000 });

  assert.equal(result.due.length, 3);
  assert.deepEqual(
    result.due.map((entry) => entry.step.to),
    ['next', 'backup', 'manager'],
  );
  assert.equal(result.nextLevel, 3);
});

test('the ladder stops when it runs out of steps', () => {
  const deadline = '2026-01-01T00:00:00.000Z';
  const lead = { ackDeadline: deadline, escalationLevel: 3 };

  assert.equal(dueSteps({ lead, settings, now: Date.parse(deadline) + 999_000 }), null);
});
