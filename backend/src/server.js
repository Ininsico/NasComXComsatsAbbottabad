import { createApp } from './app.js';
import { config } from './config.js';
import { startEscalationTicker } from './lib/escalation.js';
import { migrateStageKeys } from './lib/leads.js';
import { seedCampusKnowledge } from './lib/knowledge.js';
import { startPaymentWatcher } from './lib/paymentWatcher.js';
import { seedDemoAccounts } from './lib/seed.js';
import { seedDemoWorkspace } from './lib/seedWorkspace.js';
import { setWhatsAppHandler, sessionInfo, startWhatsApp } from './lib/whatsapp.js';
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

// One workspace with the demo accounts as its team, so round-robin assignment and the
// escalation ladder are observable immediately after boot.
try {
  const demo = await seedDemoWorkspace();

  if (demo) {
    console.log(
      `Workspace "${demo.workspace.name}" ready · ${demo.members} member(s) added · ${demo.acknowledgeSeconds}s acknowledge timer`,
    );
  }
} catch (error) {
  console.error(`Workspace seeding failed: ${error.message}`);
}

// Rewrite stage keys from before the pipeline was renamed, so nothing goes missing.
try {
  const migrated = await migrateStageKeys();

  if (migrated > 0) console.log(`Migrated ${migrated} lead(s) onto the current pipeline stages.`);
} catch (error) {
  console.error(`Stage migration failed: ${error.message}`);
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
  console.log(`Nascom CRM API listening on http://localhost:${config.port} (${config.env})`);
  startPaymentWatcher();

  // The promise of the product: a lead nobody acknowledges escalates by itself.
  startEscalationTicker();

  setWhatsAppHandler(createWhatsAppHandler());

  // Auto-connect when a linked session exists, so a scan is a one-time step.
  // Without one we stay out of the way, so `whatsapp:pair` never fights this
  // process for the same browser profile.
  const session = sessionInfo();

  if (config.whatsapp.enabled || session.paired) {
    void startWhatsApp();
  } else {
    console.log(
      '[whatsapp] no linked session — link one with: npm --prefix backend run whatsapp:pair',
    );
  }
});
