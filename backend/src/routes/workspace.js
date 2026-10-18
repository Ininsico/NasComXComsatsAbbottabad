import { Router } from 'express';
import { record as audit } from '../lib/audit.js';
import { requireAuth } from '../lib/auth.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import { describe, listMembers, permissionsFor, removeMember, updateMember } from '../lib/members.js';
import { LEVELS, LEVEL_LABELS, PERMISSIONS, outranks } from '../lib/permissions.js';
import { createRole, listRoles, removeRole, updateRole } from '../lib/roles.js';
import { getSettings, saveSettings } from '../lib/settings.js';

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
  const settings = await saveSettings(req.workspace.id, req.body);

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'workspace.settings_updated',
    metadata: {
      acknowledgeSeconds: settings.acknowledgeSeconds,
      escalation: settings.escalation,
      maxOpenLeads: settings.maxOpenLeads,
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

  const updated = await updateMember(target.id, req.workspace.id, req.body ?? {});

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'member.updated',
    target: target.id,
    metadata: { changes: Object.keys(req.body ?? {}) },
  });

  return res.json({ member: updated });
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
