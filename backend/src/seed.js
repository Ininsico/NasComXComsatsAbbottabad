import { seedDemoAccounts } from './lib/seed.js';

const created = await seedDemoAccounts();

if (created.length > 0) {
  console.log(`Created ${created.length} demo account(s):`);
  for (const account of created) console.log(`  · ${account.email} (${account.role})`);
} else {
  console.log('Demo accounts already exist — nothing to do.');
}
