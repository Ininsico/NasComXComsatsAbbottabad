import { ChromaClient } from 'chromadb';
import { createAdaptiveStore, createRagPipeline, SHARED_NAMESPACE } from '../../../AI/src/index.js';
import { config } from '../config.js';

/**
 * Single RAG pipeline for the whole backend.
 *
 * The store prefers Chroma (one collection per namespace, so every member has a
 * genuinely separate vector space) and falls back to the bundled store if the
 * Chroma server cannot be reached. The Chroma client is injected here because
 * the AI package itself carries no dependencies.
 */
const store = createAdaptiveStore({
  chromaUrl: config.rag.useChroma ? config.rag.chromaUrl : null,
  semanticUrl: config.rag.useSemantic ? config.rag.embeddingsUrl : null,
  preferSemantic: config.rag.useSemantic,
  dataDir: config.rag.dataDir || undefined,
  ChromaClient,
  onFallback: (error) => {
    console.warn(`RAG: ${error.message} — falling back`);
  },
});

const pipeline = createRagPipeline({
  store,
  generation: {
    apiKey: config.groq.apiKey,
    model: config.groq.model,
    endpoint: config.groq.endpoint,
    maxTokens: config.groq.maxTokens,
    temperature: 0.3,
    reasoningEffort: config.groq.reasoningEffort,
  },
});

/**
 * Chat-shaped generation: the smaller model, the least reasoning, and a short
 * reply budget. A WhatsApp reply does not need paragraph-length prose, and every
 * extra token is latency the sender can feel.
 */
export const CHAT_GENERATION = {
  model: config.groq.fastModel,
  reasoningEffort: 'low',
  maxTokens: 220,
  temperature: 0.4,
};

export { SHARED_NAMESPACE, store };
export default pipeline;

/**
 * The corpus the assistant answers from: how this product works.
 *
 * Deliberately product help rather than invented customer data — the assistant may state
 * how the CRM behaves and must not make up a tenant's numbers.
 */
function productDocuments() {
  return [
    {
      sourceId: 'product-pipeline',
      title: 'Pipelines and stages',
      text:
        'Every workspace runs opportunities on a pipeline. An Admin can add, rename, reorder ' +
        'and delete stages from Settings, even while opportunities sit in them. Moving an ' +
        'opportunity into a stage whose required fields are missing is refused with a message ' +
        'naming the fields, and the opportunity stays where it was.',
    },
    {
      sourceId: 'product-lead-protection',
      title: 'Assignment, acknowledgement and escalation',
      text:
        'New leads are assigned round-robin to members whose status is Available and who are ' +
        'under their open-lead limit. Busy, On leave and Offline members never receive leads. ' +
        'Setting a member On leave or Offline immediately reassigns their unacknowledged ' +
        'opportunities. Each owner gets a countdown; the opportunity counts as acknowledged ' +
        'when someone clicks Acknowledge or records any action — a note, a message, a call log, ' +
        'a stage change or an appointment. If the countdown expires the opportunity escalates ' +
        'through the configured ladder: next eligible rep, then the designated backup, then a ' +
        'manager. The number of levels and the seconds per level are configurable, and each ' +
        'step raises an alert to the new owner.',
    },
    {
      sourceId: 'product-recovery',
      title: 'The recovery queue',
      text:
        'The recovery queue lists open opportunities that need a person now: unacknowledged ' +
        'past the deadline, escalated twice or more, or untouched for longer than the idle ' +
        'period. Each item states its reason and links to the record.',
    },
    {
      sourceId: 'product-records',
      title: 'Companies, contacts and opportunities',
      text:
        'A company holds many contacts. A contact belongs to a company and holds many ' +
        'opportunities. Every contact page shows the conversation, the opportunities, the ' +
        'payments, the appointments, the assigned employee and the full activity history, in ' +
        'time order with the actor named.',
    },
    {
      sourceId: 'product-permissions',
      title: 'Permissions and visibility',
      text:
        'Workspaces have three base levels — Owner, Admin and User — plus any roles built from ' +
        'permission bundles, such as a Manager. Permissions cover viewing, creating, editing, ' +
        'deleting and exporting records, managing assignment rules, managing integrations and ' +
        'reading the audit log. Opportunity value can be hidden from members who do not hold ' +
        'the value permission: the server omits it from lists, detail pages and exports rather ' +
        'than hiding it in the browser. An Owner can never be modified by an Admin.',
    },
    {
      sourceId: 'product-integrations',
      title: 'Integrations and billing',
      text:
        'WhatsApp links one number per workspace from the integrations page; the session is ' +
        'stored per workspace, so one workspace never messages from another one. Outbound ' +
        'messages record their status, repeated deliveries are de-duplicated, and a contact who ' +
        'has opted out is blocked with the reason shown. Google Calendar connects per employee ' +
        'for appointment booking, with conflicts checked first and times stored with an explicit ' +
        'timezone. Card payments run through Stripe in test mode: card details are entered on ' +
        'Stripe and never reach this server, and payments confirm by signature-verified ' +
        'webhooks. Payments received counts confirmed payments only; projected revenue counts ' +
        'open opportunities plus unpaid requests.',
    },
    {
      sourceId: 'product-audit',
      title: 'The audit log',
      text:
        'Assignments, acknowledgements, escalations, reassignments, role and permission ' +
        'changes, pipeline and field configuration changes, integration connections and ' +
        'deletions are written to a tamper-evident audit log with the actor, the time, the ' +
        'target and the before and after values. It is readable only with the audit permission, ' +
        'filterable by event type, user and date, and cannot be edited or deleted.',
    },
  ];
}

/**
 * Wait for the embeddings service to answer before indexing.
 *
 * The store decides once whether semantic embeddings are usable, and a failure at that
 * moment makes it fall back to the hashed embedder for the life of the process. Booting
 * faster than the Python service therefore quietly costs retrieval quality, which is
 * exactly what happened on the first container deploys. Waiting here removes the race.
 */
async function waitForEmbeddings(attempts = 20, delayMs = 3000) {
  if (!config.rag.useSemantic) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${config.rag.embeddingsUrl}/health`, {
        signal: AbortSignal.timeout(4000),
      });

      if (response.ok) return true;
    } catch {
      // not up yet
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

/** Idempotent: re-ingesting a sourceId replaces that source. */
export async function seedProductKnowledge() {
  const semanticReady = await waitForEmbeddings();

  if (config.rag.useSemantic && !semanticReady) {
    console.warn(
      'RAG: the embeddings service never answered — indexing with the hashed fallback, retrieval quality will be lower',
    );
  }

  const result = await pipeline.ingestMany({
    namespace: SHARED_NAMESPACE,
    documents: productDocuments(),
  });

  return result;
}
