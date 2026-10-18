import { Router } from 'express';
import { record as audit } from '../lib/audit.js';
import { requireAuth } from '../lib/auth.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import { db } from '../lib/db.js';
import { describe, listMembers, membershipForUser, permissionsFor, removeMember, updateMember } from '../lib/members.js';
import { LEVELS, LEVEL_LABELS, PERMISSIONS, outranks } from '../lib/permissions.js';
import { createRole, findRole, listRoles, removeRole, updateRole } from '../lib/roles.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { findUserByEmail } from '../lib/store.js';
import { createMember } from '../lib/members.js';

const router = Router();

router.use(requireAuth, workspaceContext);

router.get('/', async (req, res) => {
  const settings = await getSettings(req.workspace.id);
  const members = await listMembers(req.workspace.id);

  res.json({
    workspace: req.workspace,
    member: describe(req.member, req.permissions),
    settings,
    members: await Promise.all(
      members.map(async (member) => describe(member, await permissionsFor(member))),
    ),
    levels: LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] })),
    permissions: PERMISSIONS,
  });
});

router.put('/settings', requirePermission('assignment.manage'), async (req, res) => {
  const current = await getSettings(req.workspace.id);

  /**
   * Deleting a stage is the one pipeline edit that can strand data. Every other edit —
   * label, order, required fields, the closed/win flags — is safe, because the key stays
   * the same. So the removal is checked against the records, and refused with the count
   * instead of quietly orphaning opportunities into a stage the board no longer draws.
   */
  if (Array.isArray(req.body?.pipeline)) {
    const nextKeys = new Set(
      req.body.pipeline.map((stage) => String(stage.key ?? '').toLowerCase()).filter(Boolean),
    );
    const removed = current.pipeline.filter((stage) => !nextKeys.has(stage.key));

    if (nextKeys.size === 0) {
      return res.status(400).json({ error: 'A pipeline needs at least one stage' });
    }

    if (removed.length > 0) {
      const rows = await db.collection('leads').where((lead) => lead.workspaceId === req.workspace.id);
      const blocking = [];

      for (const stage of removed) {
        const used = rows.filter((lead) => lead.stage === stage.key).length;

        if (used > 0) blocking.push({ key: stage.key, label: stage.label, count: used });
      }

      if (blocking.length > 0) {
        const summary = blocking.map((entry) => `${entry.count} in "${entry.label}"`).join(', ');

        return res.status(409).json({
          error: `Move the opportunities out of these stages first: ${summary}.`,
          stages: blocking,
        });
      }
    }
  }

  const settings = await saveSettings(req.workspace.id, req.body);

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'workspace.settings_updated',
    metadata: {
      acknowledgeSeconds: settings.acknowledgeSeconds,
      escalation: settings.escalation,
      maxOpenLeads: settings.maxOpenLeads,
      pipeline: settings.pipeline.map((stage) => stage.key),
      customFields: settings.customFields.map((field) => field.key),
    },
  });

  return res.json({ settings });
});

router.get('/members', requirePermission('crm.view'), async (req, res) => {
  const members = await listMembers(req.workspace.id);

  res.json({
    members: await Promise.all(
      members.map(async (member) => describe(member, await permissionsFor(member))),
    ),
  });
});

/**
 * Invite someone into this workspace.
 *
 * Accounts are created with Google, so the person has to have signed in once — this adds
 * their existing account to the workspace rather than creating a credential, which keeps
 * "who can sign in" separate from "who is in this workspace".
 */
router.post('/members', requirePermission('assignment.manage'), async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const level = String(req.body?.level ?? 'user');

  if (!email) return res.status(400).json({ error: 'Enter the email address to invite' });
  if (!LEVELS.includes(level)) return res.status(400).json({ error: `Level must be one of: ${LEVELS.join(', ')}` });

  // You cannot invite someone above yourself, and only an owner may create another owner.
  if (!outranks(req.member.level, level) && !(req.member.level === 'owner' && level === 'owner')) {
    return res.status(403).json({ error: 'You cannot invite someone at or above your own level' });
  }

  const user = await findUserByEmail(email);

  if (!user) {
    return res.status(404).json({
      error: 'No account with that address yet. Ask them to sign in with Google once, then invite them.',
    });
  }

  const existing = await membershipForUser(user.id);

  if (existing) {
    return res.status(409).json({
      error:
        existing.workspaceId === req.workspace.id
          ? 'They are already in this workspace'
          : 'That account already belongs to another workspace',
    });
  }

  const roleId = req.body?.roleId ? String(req.body.roleId) : null;

  if (roleId && !(await findRole(roleId, req.workspace.id))) {
    return res.status(400).json({ error: 'No such role in this workspace' });
  }

  const member = await createMember({
    workspaceId: req.workspace.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    level,
    roleId,
    backup: Boolean(req.body?.backup),
  });

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'member.invited',
    target: member.id,
    metadata: { email: user.email, level, roleId },
  });

  return res.status(201).json({ member: describe(member, await permissionsFor(member)) });
});

router.patch('/members/:id', requirePermission('assignment.manage'), async (req, res) => {
  const target = (await listMembers(req.workspace.id)).find((member) => member.id === req.params.id);

  if (!target) return res.status(404).json({ error: 'No such member' });

  // You may not demote someone at or above your own level.
  if (!outranks(req.member.level, target.level) && req.member.id !== target.id) {
    return res.status(403).json({ error: 'You cannot change a member at or above your level' });
  }

  if (req.body?.level && !outranks(req.member.level, req.body.level) && req.member.id !== target.id) {
    return res.status(403).json({ error: 'You cannot promote someone to your level or above' });
  }

  // The workspace must keep an owner: nobody, including the owner themselves, may demote
  // the last one out of existence.
  if (target.level === 'owner' && req.body?.level && req.body.level !== 'owner') {
    const owners = (await listMembers(req.workspace.id)).filter((member) => member.level === 'owner');

    if (owners.length <= 1) {
      return res.status(400).json({
        error: 'This is the only owner. Promote someone else to Owner first.',
      });
    }
  }

  const updated = await updateMember(target.id, req.workspace.id, req.body ?? {});

  // Going unavailable is a promise to the customer: their unanswered leads are handed over
  // now, not at the next escalation tick.
  let reassigned = [];

  if (req.body?.available === false) {
    const { reassignUnacknowledged } = await import('../lib/leads.js');

    reassigned = await reassignUnacknowledged({
      workspaceId: req.workspace.id,
      memberId: target.id,
      actorName: req.user.name,
    });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'member.updated',
    target: target.id,
    metadata: { changes: Object.keys(req.body ?? {}), reassigned: reassigned.length },
  });

  return res.json({ member: updated, reassigned });
});

router.delete('/members/:id', requirePermission('assignment.manage'), async (req, res) => {
  const target = (await listMembers(req.workspace.id)).find((member) => member.id === req.params.id);

  if (!target) return res.status(404).json({ error: 'No such member' });

  if (target.level === 'owner') {
    return res.status(400).json({ error: 'The workspace owner cannot be removed' });
  }

  if (!outranks(req.member.level, target.level)) {
    return res.status(403).json({ error: 'You cannot remove a member at or above your level' });
  }

  await removeMember(target.id, req.workspace.id);

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'member.removed',
    target: target.id,
  });

  return res.json({ ok: true });
});

router.get('/roles', requirePermission('crm.view'), async (req, res) => {
  res.json({ roles: await listRoles(req.workspace.id) });
});

router.post('/roles', requirePermission('assignment.manage'), async (req, res) => {
  const name = String(req.body?.name ?? '').trim();

  if (!name) return res.status(400).json({ error: 'A role needs a name' });

  const role = await createRole({
    workspaceId: req.workspace.id,
    name,
    label: req.body?.label,
    permissions: req.body?.permissions ?? [],
  });

  await audit({ workspaceId: req.workspace.id, actorId: req.user.id, action: 'role.created', target: role.id });

  return res.status(201).json({ role });
});

router.patch('/roles/:id', requirePermission('assignment.manage'), async (req, res) => {
  const role = await updateRole(req.params.id, req.workspace.id, req.body ?? {});

  if (!role) return res.status(404).json({ error: 'No such role' });

  await audit({ workspaceId: req.workspace.id, actorId: req.user.id, action: 'role.updated', target: role.id });

  return res.json({ role });
});

router.delete('/roles/:id', requirePermission('assignment.manage'), async (req, res) => {
  const role = await removeRole(req.params.id, req.workspace.id);

  if (!role) return res.status(404).json({ error: 'No such role' });

  await audit({ workspaceId: req.workspace.id, actorId: req.user.id, action: 'role.deleted', target: role.id });

  return res.json({ ok: true });
});

export default router;
