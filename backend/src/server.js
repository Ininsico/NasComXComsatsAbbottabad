import { createApp } from './app.js';
import { config } from './config.js';
import { seedDemoAccounts } from './lib/seed.js';

const seeded = await seedDemoAccounts();
if (seeded.length > 0) {
  console.log(`Seeded ${seeded.length} demo account(s).`);
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`COMSATS API listening on http://localhost:${config.port} (${config.env})`);
});
