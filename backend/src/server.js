import { createApp } from './app.js';
import { config } from './config.js';
import { seedCampusKnowledge } from './lib/knowledge.js';
import { startPaymentWatcher } from './lib/paymentWatcher.js';
import { seedDemoAccounts } from './lib/seed.js';
import { setWhatsAppHandler, startWhatsApp } from './lib/whatsapp.js';
import { createWhatsAppHandler } from './lib/whatsappBot.js';

// The embedded WhatsApp browser emits events from its own async context. A stray
// rejection there must never take the API down with it, so log and carry on.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandled rejection]', reason?.message ?? reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaught exception]', error?.message ?? error);
});

const seeded = await seedDemoAccounts();
if (seeded.length > 0) {
  console.log(`Seeded ${seeded.length} demo account(s).`);
}

// Index the published campus knowledge so the RAG pipeline can retrieve it.
try {
  const knowledge = await seedCampusKnowledge();
  console.log(`RAG: indexed ${knowledge.chunks} chunk(s) into ${knowledge.namespace}`);
} catch (error) {
  console.error(`RAG seeding failed: ${error.message}`);
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`COMSATS API listening on http://localhost:${config.port} (${config.env})`);
  startPaymentWatcher();

  setWhatsAppHandler(createWhatsAppHandler());

  if (config.whatsapp.enabled) {
    void startWhatsApp();
  } else {
    console.log('[whatsapp] auto-start is off — start it from the admin console when needed');
  }
});
