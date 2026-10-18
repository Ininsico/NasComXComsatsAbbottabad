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
    if (patch.available !== undefined) member.available = Boolean(patch.available);
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
    levelLabel: LEVEL_LABELS[member.level] ?? member.level,
    permissions,
  };
}
