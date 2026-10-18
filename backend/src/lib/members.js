import { db } from './db.js';
import { LEVELS, LEVEL_LABELS, resolvePermissions } from './permissions.js';
import { findRole } from './roles.js';

/** Membership of a user in a workspace: level, optional custom role, limits. */
const members = db.collection('members');

const text = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);

export async function listMembers(workspaceId) {
  return (await members.where((member) => member.workspaceId === workspaceId)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function findMember(id, workspaceId) {
  return members.find((member) => member.id === id && member.workspaceId === workspaceId);
}

export async function findMemberByUser(workspaceId, userId) {
  return members.find(
    (member) => member.workspaceId === workspaceId && member.userId === userId,
  );
}

/** The workspace a user belongs to. One membership per user for now. */
export async function membershipForUser(userId) {
  return members.find((member) => member.userId === userId);
}

/** The named availability states the spec distinguishes. Only `available` takes new work. */
export const MEMBER_STATUSES = ['available', 'busy', 'on_leave', 'offline'];

export const MEMBER_STATUS_LABELS = {
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  offline: 'Offline',
};

export async function createMember({
  workspaceId,
  userId,
  name,
  email,
  level = 'user',
  roleId = null,
  openLeadLimit = null,
  backup = false,
}) {
  return members.insert({
    workspaceId,
    userId,
    name: text(name, 120),
    email: text(email, 160).toLowerCase(),
    level: LEVELS.includes(level) ? level : 'user',
    roleId,
    granted: [],
    revoked: [],
    openLeadLimit,
    backup,
    status: 'available',
    available: true,
    createdAt: new Date().toISOString(),
  });
}

export async function updateMember(id, workspaceId, patch) {
  return members.mutate((rows) => {
    const member = rows.find((row) => row.id === id && row.workspaceId === workspaceId);
    if (!member) return null;

    if (patch.level !== undefined && LEVELS.includes(patch.level)) member.level = patch.level;
    if (patch.roleId !== undefined) member.roleId = patch.roleId || null;
    if (patch.name !== undefined) member.name = text(patch.name, 120);
    if (patch.openLeadLimit !== undefined) {
      member.openLeadLimit = patch.openLeadLimit === null ? null : Number(patch.openLeadLimit);
    }

    // The named status is the source of truth; `available` is derived from it so the
    // assignment engine keeps its single boolean check. Busy, On leave and Offline all
    // stop new work, and any move off Available immediately hands over their open leads
    // (the route does that part).
    if (patch.status !== undefined && MEMBER_STATUSES.includes(patch.status)) {
      member.status = patch.status;
      member.available = patch.status === 'available';
    }

    if (patch.available !== undefined && patch.status === undefined) {
      member.available = Boolean(patch.available);
      member.status = member.available ? 'available' : 'offline';
    }

    if (patch.backup !== undefined) member.backup = Boolean(patch.backup);
    if (Array.isArray(patch.granted)) member.granted = patch.granted;
    if (Array.isArray(patch.revoked)) member.revoked = patch.revoked;

    // Per-user notification routing: where an escalation for THIS person is sent. Empty
    // fields fall back to the workspace's channels; the bot token stays with the workspace.
    if (patch.notificationRouting !== undefined) {
      const route = patch.notificationRouting ?? {};

      member.notificationRouting = {
        webhookUrl: text(route.webhookUrl, 400),
        slackWebhookUrl: text(route.slackWebhookUrl, 400),
        telegramChatId: text(route.telegramChatId, 80),
      };
    }

    return member;
  });
}

export async function removeMember(id, workspaceId) {
  return members.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);
    if (index === -1) return null;

    return rows.splice(index, 1)[0];
  });
}

/** Effective permissions for a member, resolving any attached custom role. */
export async function permissionsFor(member) {
  const role = member.roleId ? await findRole(member.roleId, member.workspaceId) : null;

  return resolvePermissions({
    level: member.level,
    rolePermissions: role?.permissions ?? [],
    granted: member.granted ?? [],
    revoked: member.revoked ?? [],
  });
}

export function describe(member, permissions) {
  return {
    ...member,
    status: member.status ?? (member.available === false ? 'offline' : 'available'),
    statusLabel: MEMBER_STATUS_LABELS[member.status ?? (member.available === false ? 'offline' : 'available')],
    levelLabel: LEVEL_LABELS[member.level] ?? member.level,
    permissions,
  };
}
