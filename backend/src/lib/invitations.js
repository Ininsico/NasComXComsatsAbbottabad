import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { createMember, membershipForUser } from './members.js';
import { findRole } from './roles.js';

/**
 * Invitations: how an Owner adds someone who has no account yet.
 *
 * The invitation carries the workspace, the level and the role the Owner picked, and reaches
 * the person as an emailed link. Accepting it — with a fresh signup or with Google — makes
 * them a member of the inviting workspace, so a first-time user lands on the inviter's
 * pipeline instead of an empty workspace of their own.
 */
const invitations = db.collection('invitations');
const TTL_DAYS = Number(process.env.INVITATION_TTL_DAYS ?? 7);

export function invitationLink(token) {
  const origin = (process.env.PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');

  return `${origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

export async function createInvitation({ workspaceId, email, level, roleId = null, invitedBy }) {
  const pending = await invitations.find(
    (row) => row.workspaceId === workspaceId && row.email === email && !row.acceptedAt,
  );

  if (pending) {
    pending.level = level;
    pending.roleId = roleId;
    pending.expiresAt = new Date(Date.now() + TTL_DAYS * 86400000).toISOString();

    await invitations.mutate((rows) => {
      const index = rows.findIndex((row) => row.id === pending.id);

      if (index !== -1) rows[index] = pending;
    });

    return pending;
  }

  return invitations.insert({
    id: randomUUID(),
    workspaceId,
    email,
    level,
    roleId,
    token: randomUUID(),
    invitedBy,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_DAYS * 86400000).toISOString(),
    acceptedAt: null,
    acceptedBy: null,
  });
}

/** The invitation behind a link, or the reason it cannot be used. */
export async function findInvitation(token) {
  if (!token) return { error: 'That link is missing its invitation code' };

  const invitation = await invitations.find((row) => row.token === token);

  if (!invitation) return { error: 'That invitation link is not valid' };
  if (invitation.acceptedAt) return { error: 'That invitation has already been used' };
  if (Date.parse(invitation.expiresAt) < Date.now()) return { error: 'That invitation has expired' };

  return { invitation };
}

export async function findPendingInvitationForEmail(email) {
  const address = String(email).toLowerCase();

  return invitations.find(
    (row) => row.email === address && !row.acceptedAt && Date.parse(row.expiresAt) > Date.now(),
  );
}

export async function describeInvitation(invitation) {
  const workspace = await db.collection('workspaces').find((row) => row.id === invitation.workspaceId);
  const role = invitation.roleId ? await findRole(invitation.roleId, invitation.workspaceId) : null;

  return {
    workspaceId: invitation.workspaceId,
    workspaceName: workspace?.name ?? 'a workspace',
    level: invitation.level,
    roleName: role?.name ?? null,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Turn an invitation into a membership. Refuses when the person already belongs to another
 * workspace: a user has one workspace in this model, so an invitation is not a way to
 * quietly move someone out of theirs.
 */
export async function acceptInvitation({ token, user }) {
  const { invitation, error } = await findInvitation(token);

  if (error) return { error };

  if (invitation.email !== String(user.email).toLowerCase()) {
    return { error: `This invitation is for ${invitation.email}. Sign in with that address to accept it.` };
  }

  const existing = await membershipForUser(user.id);

  if (existing && existing.workspaceId !== invitation.workspaceId) {
    return { error: 'That account already belongs to another workspace' };
  }

  let member = existing;

  if (!member) {
    member = await createMember({
      workspaceId: invitation.workspaceId,
      userId: user.id,
      name: user.name,
      email: user.email,
      level: invitation.level,
      roleId: invitation.roleId,
    });
  }

  await invitations.mutate((rows) => {
    const row = rows.find((entry) => entry.token === token);

    if (!row) return;

    row.acceptedAt = new Date().toISOString();
    row.acceptedBy = user.id;
  });

  return { member, invitation };
}

export async function listInvitations(workspaceId) {
  const rows = await invitations.read();

  return rows
    .filter((row) => row.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
