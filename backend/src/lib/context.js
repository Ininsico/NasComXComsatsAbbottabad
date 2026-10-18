import { db } from './db.js';
import { createMember, membershipForUser, permissionsFor } from './members.js';
import { saveSettings } from './settings.js';
import { createWorkspace, findWorkspace } from './workspaces.js';

/**
 * Every request runs inside a workspace. The membership is the source of truth for
 * isolation: a lead is only ever read or written through the workspace it belongs to,
 * so a crafted id from another company simply finds nothing.
 */
export function workspaceContext(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  (async () => {
    const membership = await membershipForUser(req.user.id);

    if (!membership) {
      return res.status(403).json({ error: 'Your account is not a member of any workspace' });
    }

    const workspace = await findWorkspace(membership.workspaceId);

    if (!workspace) {
      return res.status(403).json({ error: 'The workspace no longer exists' });
    }

    req.workspace = workspace;
    req.member = membership;
    req.permissions = await permissionsFor(membership);

    return next();
  })().catch(next);
}

/** Throws 403 when the member lacks a permission, so routes read as a single line. */
export function requirePermission(key) {
  return (req, res, next) => {
    if (!req.permissions?.includes(key)) {
      return res.status(403).json({ error: `Your role does not allow: ${key}` });
    }

    return next();
  };
}

/**
 * Idempotent: gives a user a workspace the first time they need one, as Owner, with
 * default settings. The demo seed uses the same path.
 */
export async function ensureWorkspaceForUser(user, { workspaceName } = {}) {
  const existing = await membershipForUser(user.id);

  if (existing) {
    const workspace = await findWorkspace(existing.workspaceId);

    if (workspace) return { workspace, member: existing };
  }

  const workspace = await createWorkspace({
    name: workspaceName || `${user.name}'s workspace`,
    ownerId: user.id,
  });

  const member = await createMember({
    workspaceId: workspace.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    level: 'owner',
  });

  await saveSettings(workspace.id, {});

  return { workspace, member };
}

/** Add a user to an existing workspace as a given level, if they are not already in one. */
export async function addMemberIfAbsent({ workspaceId, user, level = 'user', backup = false }) {
  const membership = await membershipForUser(user.id);

  if (membership) return membership;

  return createMember({
    workspaceId,
    userId: user.id,
    name: user.name,
    email: user.email,
    level,
    backup,
  });
}

export { db };
