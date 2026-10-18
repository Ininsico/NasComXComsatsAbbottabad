/**
 * Seed a demo workspace you can sign into with one click.
 *
 *   npm --prefix backend run demo:seed
 *
 * Creates one account per access level, a "Manager" role built from a permission bundle,
 * and a small set of companies, contacts and opportunities so the board is not empty. It
 * is idempotent, and it records what it created in a marker file — the sign-in page only
 * offers the instant-login buttons when that marker exists, so a real deployment never
 * shows them or exposes the passwords.
 *
 * This is deliberately separate from boot. Nothing is seeded unless you ask for it.
 */
import { hashPassword } from '../lib/auth.js';
import { writeDemoSeed } from '../lib/demoAccounts.js';
import { createMember, listMembers, membershipForUser } from '../lib/members.js';
import { createRole, findRoleByName } from '../lib/roles.js';
import { saveSettings } from '../lib/settings.js';
import { createUser, findUserByEmail } from '../lib/store.js';
import { createWorkspace } from '../lib/workspaces.js';
import { createLead } from '../lib/leads.js';

const PASSWORD = 'Demo12345';
const DOMAIN = 'demo.nascom.test';

const PEOPLE = [
  { key: 'owner', label: 'Owner', summary: 'everything, including roles and the audit log', name: 'Ayesha Siddiqui', level: 'owner' },
  { key: 'admin', label: 'Admin', summary: 'reshapes rules and integrations, cannot touch the owner', name: 'Rubina Aslam', level: 'admin' },
  { key: 'manager', label: 'Manager role', summary: 'a permission bundle: no delete, no export, no value', name: 'Sadia Khan', level: 'user', role: true },
  { key: 'rep', label: 'Member', summary: 'view and create only', name: 'Hamza Riaz', level: 'user' },
];

const MANAGER_PERMISSIONS = ['crm.view', 'crm.create', 'crm.edit', 'assignment.manage', 'audit.view'];

const SAMPLE = [
  {
    name: 'Northwind Logistics',
    contact: { name: 'Bilal Ahmed', email: 'bilal@northwind.example', phone: '+923001234501', title: 'Operations lead' },
    opportunities: [
      { name: 'Northwind — fleet tracking', stage: 'qualified', value: 14500, source: 'website' },
      { name: 'Northwind — driver app', stage: 'new', value: 6200, source: 'whatsapp' },
    ],
  },
  {
    name: 'Karakoram Foods',
    contact: { name: 'Nadia Rehman', email: 'nadia@karakoram.example', phone: '+923001234502', title: 'Head of sales' },
    opportunities: [
      { name: 'Karakoram — telesales rollout', stage: 'proposal', value: 21300, source: 'referral' },
      { name: 'Karakoram — distributor portal', stage: 'contacted', value: 9800, source: 'event' },
    ],
  },
  {
    name: 'Indus Clinics',
    contact: { name: 'Dr. Faraz Iqbal', email: 'faraz@indus.example', phone: '+923001234503', title: 'Managing partner' },
    opportunities: [
      { name: 'Indus — appointment reminders', stage: 'new', value: 4300, source: 'website' },
      { name: 'Indus — patient follow-up', stage: 'won', value: 17500, source: 'manual' },
    ],
  },
];

const emailFor = (key) => `${key}@${DOMAIN}`;

async function ensureUser(person) {
  const email = emailFor(person.key);
  const existing = await findUserByEmail(email);

  if (existing) return { user: existing, created: false };

  const user = await createUser({
    name: person.name,
    email,
    passwordHash: await hashPassword(PASSWORD),
    role: 'user',
  });

  return { user, created: true };
}

async function ensureWorkspace(ownerUser) {
  const membership = await membershipForUser(ownerUser.id);

  if (membership) {
    const { findWorkspace } = await import('../lib/workspaces.js');
    const workspace = await findWorkspace(membership.workspaceId);

    if (workspace) return workspace;
  }

  const workspace = await createWorkspace({ name: 'Nascom Demo', ownerId: ownerUser.id });

  await createMember({
    workspaceId: workspace.id,
    userId: ownerUser.id,
    name: ownerUser.name,
    email: ownerUser.email,
    level: 'owner',
  });

  return workspace;
}

const created = { users: 0, members: 0, opportunities: 0 };
const accounts = [];

// 1. The owner, then the workspace.
const owner = await ensureUser(PEOPLE[0]);
if (owner.created) created.users += 1;
const workspace = await ensureWorkspace(owner.user);

const settings = await saveSettings(workspace.id, {
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

// 2. The Manager role, so the difference between a level and a role is visible in the UI.
let managerRole = await findRoleByName('Manager', workspace.id);

if (!managerRole) {
  managerRole = await createRole({
    workspaceId: workspace.id,
    name: 'Manager',
    label: 'Manager',
    permissions: MANAGER_PERMISSIONS,
  });
}

// 3. Everyone else, at their level or on that role.
for (const person of PEOPLE) {
  const { user, created: isNew } = await ensureUser(person);
  if (isNew) created.users += 1;

  const existing = await listMembers(workspace.id);

  if (existing.some((member) => member.userId === user.id)) continue;

  await createMember({
    workspaceId: workspace.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    level: person.level,
    roleId: person.role ? managerRole.id : null,
    backup: person.key === 'admin',
  });

  created.members += 1;
}

for (const person of PEOPLE) {
  accounts.push({
    key: person.key,
    label: person.label,
    summary: person.summary,
    name: person.name,
    email: emailFor(person.key),
    password: PASSWORD,
  });
}

// 4. A small, plausible pipeline, written through the same path the product uses so the
//    round-robin assignment and the acknowledgement clock are live on every one of them.
const existingLeads = (await listMembers(workspace.id)).length;

if (existingLeads > 0) {
  const { listLeads } = await import('../lib/leads.js');
  const already = await listLeads(workspace.id);

  if (already.length === 0) {
    for (const sample of SAMPLE) {
      for (const opportunity of sample.opportunities) {
        const result = await createLead({
          workspaceId: workspace.id,
          input: {
            name: opportunity.name,
            email: sample.contact.email,
            phone: sample.contact.phone,
            source: opportunity.source,
            value: opportunity.value,
            notes: `${sample.name} · ${sample.contact.name}, ${sample.contact.title}`,
          },
          actorName: 'demo seed',
        });

        await import('../lib/leads.js').then(({ updateLead }) =>
          updateLead({
            workspaceId: workspace.id,
            id: result.lead.id,
            patch: { stage: opportunity.stage },
            actorName: 'demo seed',
          }),
        );

        created.opportunities += 1;
      }
    }
  }
}

const marker = await writeDemoSeed(accounts);

console.log(`Workspace: ${workspace.name} (${workspace.id})`);
console.log(`Acknowledge timer: ${settings.acknowledgeSeconds}s`);
console.log(`Created ${created.users} account(s), ${created.members} membership(s), ${created.opportunities} opportunity(ies).`);
console.log(`Sign-in buttons are now offered by the API (marker written ${marker.seededAt}).`);
console.log('');
for (const account of accounts) {
  console.log(`  ${account.label.padEnd(13)} ${account.email}  ${account.password}`);
}
