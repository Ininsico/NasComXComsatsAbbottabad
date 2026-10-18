import { config } from '../config.js';
import { hashPassword } from './auth.js';
import { db } from './db.js';
import { createMember, listMembers } from './members.js';
import { createRole, findRoleByName } from './roles.js';
import { saveSettings } from './settings.js';
import { createUser, findUserByEmail } from './store.js';
import { createWorkspace } from './workspaces.js';

/**
 * The four demo identities behind the instant-login buttons, one per role.
 *
 * They all belong to ONE workspace, which is the point: the same records look different
 * depending on who is signed in — the Owner can change roles, the Admin cannot touch the
 * Owner, the Manager holds a bundle without delete/export/value, the User can only view and
 * create. Nothing here is fabricated CRM data; it is four accounts with real memberships.
 *
 * Off unless INSTANT_LOGIN=true, like the rest of the instant login.
 */
const WORKSPACE_NAME = 'Instant Demo';
const PASSWORD = process.env.INSTANT_DEMO_PASSWORD ?? 'InstantDemo123';

export const INSTANT_ROLES = [
  {
    role: 'owner',
    label: 'Owner',
    level: 'owner',
    manager: false,
    name: 'Demo Owner',
    email: 'demo.owner@instant.local',
    summary: 'every permission, including roles and the audit log',
  },
  {
    role: 'admin',
    label: 'Admin',
    level: 'admin',
    manager: false,
    name: 'Demo Admin',
    email: 'demo.admin@instant.local',
    summary: 'reshapes the workspace; cannot modify the owner',
  },
  {
    role: 'manager',
    label: 'Manager',
    level: 'user',
    manager: true,
    name: 'Demo Manager',
    email: 'demo.manager@instant.local',
    summary: 'a permission bundle: no delete, no export, no value',
  },
  {
    role: 'user',
    label: 'User',
    level: 'user',
    manager: false,
    name: 'Demo User',
    email: 'demo.user@instant.local',
    summary: 'view and create only',
  },
];

const MANAGER_PERMISSIONS = ['crm.view', 'crm.create', 'crm.edit', 'assignment.manage', 'audit.view'];

async function findWorkspaceByName(name) {
  return db.collection('workspaces').find((row) => row.name === name);
}

async function ensureUser(definition) {
  const existing = await findUserByEmail(definition.email);

  if (existing) {
    if (!existing.passwordHash) {
      const { updateUser } = await import('./store.js');
      return (await updateUser(existing.id, { passwordHash: await hashPassword(PASSWORD) })) ?? existing;
    }

    return existing;
  }

  return createUser({
    name: definition.name,
    email: definition.email,
    passwordHash: await hashPassword(PASSWORD),
    // Workspace levels carry the permissions; the platform role stays `user` so these four
    // demonstrate the workspace roles rather than the operator console.
    role: 'user',
  });
}

export async function ensureInstantLogins() {
  if (!config.instantLogin.enabled) return null;

  const ownerDefinition = INSTANT_ROLES[0];
  const owner = await ensureUser(ownerDefinition);

  let workspace = await findWorkspaceByName(WORKSPACE_NAME);

  if (!workspace) {
    workspace = await createWorkspace({ name: WORKSPACE_NAME, ownerId: owner.id });

    await saveSettings(workspace.id, {
      publicIntake: true,
      acknowledgeSeconds: 45,
      idleHours: 24,
      maxOpenLeads: 4,
      timezone: 'Asia/Karachi',
      escalation: [
        { afterSeconds: 30, to: 'next' },
        { afterSeconds: 60, to: 'backup' },
        { afterSeconds: 120, to: 'manager' },
      ],
    });
  }

  const managerRole = (await findRoleByName('Manager', workspace.id)) ??
    (await createRole({
      workspaceId: workspace.id,
      name: 'Manager',
      label: 'Manager',
      permissions: MANAGER_PERMISSIONS,
    }));

  for (const definition of INSTANT_ROLES) {
    const user = await ensureUser(definition);
    const existing = (await listMembers(workspace.id)).find((member) => member.userId === user.id);

    if (existing) continue;

    await createMember({
      workspaceId: workspace.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      level: definition.level,
      roleId: definition.manager ? managerRole.id : null,
      backup: definition.role === 'admin',
    });
  }

  return { workspace, accounts: INSTANT_ROLES };
}

export async function findInstantUser(role) {
  const definition = INSTANT_ROLES.find((entry) => entry.role === role);

  if (!definition) return null;

  const user = await findUserByEmail(definition.email);

  return user ? { definition, user } : null;
}
