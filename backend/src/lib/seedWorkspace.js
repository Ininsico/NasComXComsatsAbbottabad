import { findUserByEmail } from './store.js';
import { addMemberIfAbsent, ensureWorkspaceForUser } from './context.js';
import { db } from './db.js';
import { getSettings, saveSettings } from './settings.js';

/**
 * A demo workspace that is already populated, so the assignment and escalation rules
 * are observable the moment the app boots.
 *
 * Timers are deliberately short: 45 seconds to acknowledge, then escalation at 30, 60
 * and 120 seconds after the deadline. Idempotent — it only creates things that are
 * missing.
 */
const DEMO_MEMBERS = [
  { email: 'admin@comsats-abbottabad.edu.pk', level: 'owner', backup: false },
  { email: 'rubina.aslam@comsats-abbottabad.edu.pk', level: 'admin', backup: true },
  { email: 'sadia.khan@comsats-abbottabad.edu.pk', level: 'user', backup: false },
  { email: 'ayesha.siddiqui@comsats-abbottabad.edu.pk', level: 'user', backup: false },
  { email: 'hamza.riaz@comsats-abbottabad.edu.pk', level: 'user', backup: false },
];

export async function seedDemoWorkspace() {
  const owner = await findUserByEmail('admin@comsats-abbottabad.edu.pk');

  if (!owner) return null;

  const { workspace } = await ensureWorkspaceForUser(owner, { workspaceName: 'Nascom Demo' });

  await db.collection('workspaces').mutate((rows) => {
    const row = rows.find((entry) => entry.id === workspace.id);

    if (row && row.name !== 'Nascom Demo') row.name = 'Nascom Demo';
  });

  let added = 0;

  for (const definition of DEMO_MEMBERS) {
    const user = await findUserByEmail(definition.email);

    if (!user) continue;

    const before = await db
      .collection('members')
      .find((member) => member.userId === user.id && member.workspaceId === workspace.id);

    await addMemberIfAbsent({
      workspaceId: workspace.id,
      user,
      level: definition.level,
      backup: definition.backup,
    });

    if (!before) added += 1;
  }

  // Only seed the settings once. Re-applying them on every boot would silently undo
  // whatever the team configured in the workspace settings page.
  const existingSettings = await db
    .collection('workspace-settings')
    .find((row) => row.workspaceId === workspace.id);

  const settings = existingSettings
    ? await getSettings(workspace.id)
    : await saveSettings(workspace.id, {
        publicIntake: true,
        acknowledgeSeconds: 45,
        maxOpenLeads: 4,
        timezone: 'Asia/Karachi',
        escalation: [
          { afterSeconds: 30, to: 'next' },
          { afterSeconds: 60, to: 'backup' },
          { afterSeconds: 120, to: 'manager' },
        ],
      });

  return { workspace, members: added, acknowledgeSeconds: settings.acknowledgeSeconds };
}
