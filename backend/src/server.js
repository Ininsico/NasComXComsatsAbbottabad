import { createApp } from './app.js';
import { config } from './config.js';
import { startEscalationTicker } from './lib/escalation.js';
import { seedProductKnowledge } from './lib/knowledge.js';
import { migrateStageKeys } from './lib/leads.js';
import { startPaymentWatcher } from './lib/paymentWatcher.js';
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

// Rewrite stage keys from before the pipeline was renamed, so nothing goes missing.
try {
  const migrated = await migrateStageKeys();

  if (migrated > 0) console.log(`Migrated ${migrated} lead(s) onto the current pipeline stages.`);
} catch (error) {
  console.error(`Stage migration failed: ${error.message}`);
}

// Index the product help so the assistant has something true to retrieve.
try {
  const knowledge = await seedProductKnowledge();
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
