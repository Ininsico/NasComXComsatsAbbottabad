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
 * The corpus the assistant answers from: how this product actually behaves.
 *
 * Written to be checkable. Each note describes behaviour that exists in this codebase right
 * now, names the screen involved, and the last note says plainly what is not built yet — an
 * assistant that invents a feature is worse than one that says "not yet".
 */
function productDocuments() {
  return [
    {
      sourceId: 'product-overview',
      title: 'What this product is, and the map of its screens',
      text:
        'Nascom CRM is a multi-tenant CRM: every company is a separate workspace, and a workspace ' +
        'never sees another one\'s records. Signing in lands on the Pipeline. The signed-in screens are: ' +
        'Pipeline (/crm), Lead detail (/crm/:id), Recovery queue (/recovery), Dashboard (/dashboard), ' +
        'Integrations (/integrations), Workspace settings (/settings), Subscription (/subscription), ' +
        'Voice (/voice), My profile (/profile), and the platform Admin console (/admin, administrators ' +
        'only). The public site has Home, Features, Pricing, About and a Contact form whose submission ' +
        'creates a lead in the pipeline. /deploy shows a running deployment. ' +
        'The workspace switcher, lead lists and reports are all inside those screens.',
    },
    {
      sourceId: 'product-pipeline',
      title: 'The pipeline board, stages and required fields',
      text:
        'The Pipeline board has one column per stage and one card per lead, with a count per stage. ' +
        'The stages come from the workspace settings, and the default pipeline is New, Contacted, ' +
        'Qualified, Proposal, Won and Lost. A card shows the owner, the source and the acknowledgement ' +
        'clock, and turns red once the deadline has passed. Opening a card shows the lead in full. ' +
        'A stage can require certain fields before a lead may enter it — the default pipeline requires ' +
        'an email for Qualified, email and phone for Proposal, and email, phone and value for Won. ' +
        'If those fields are missing the move is refused with a message naming them, and the lead stays ' +
        'where it was. Won and Lost are closed stages, so the acknowledgement clock stops on them.',
    },
    {
      sourceId: 'product-leads',
      title: 'Creating a lead, sources and validation',
      text:
        'A lead has a name, optional email and phone, a source, an opportunity value, notes and a stage. ' +
        'Sources are website, whatsapp, sms, walk-in, phone, referral, event and manual. Leads arrive ' +
        'three ways: the public Contact form on the marketing site, an inbound WhatsApp message on a ' +
        'linked workspace number, and the New lead button on the Pipeline. The server rejects a lead ' +
        'with neither an email nor a phone, and rejects a malformed email or phone. Every new lead is ' +
        'assigned immediately by round-robin, and the create response names the person it went to.',
    },
    {
      sourceId: 'product-lead-detail',
      title: 'The lead detail screen',
      text:
        'The lead detail screen shows the stage selector, the assigned owner, email and phone, the ' +
        'opportunity value, the notes, and the activity history. The Acknowledge button appears while ' +
        'the clock is still running. You can record an activity (note, call, email, meeting, WhatsApp ' +
        'or SMS), book a 30-minute appointment against the connected Google Calendar, change the stage ' +
        'or owner, edit the value inline, and delete the lead if your role allows deletion. Every one ' +
        'of those writes an entry to the activity history with who did it and when.',
    },
    {
      sourceId: 'product-assignment',
      title: 'Round-robin assignment and member availability',
      text:
        'New leads are assigned round-robin to members whose status is available and whose open-lead ' +
        'count is below their limit. The member who was assigned least recently is picked first, and ' +
        'the timestamp survives a restart, so the rotation does not reset. A member marked unavailable ' +
        'is skipped, as is one at their open-lead limit; if nobody qualifies the lead is created ' +
        'unassigned and the alert says so. The backup flag marks the person used by the second ' +
        'escalation step. Availability, the per-member open-lead limit and the backup flag are all on ' +
        'Workspace settings under Members.',
    },
    {
      sourceId: 'product-acknowledgement',
      title: 'The acknowledgement clock and escalation ladder',
      text:
        'Each assigned lead gets an acknowledgement deadline, set by the workspace acknowledge timer ' +
        '(45 seconds in a demo, and configurable to as little as one second). The lead counts as ' +
        'acknowledged when someone clicks Acknowledge. The clock is compared against the deadline, not ' +
        'against the last activity. When the deadline passes, the escalation ladder runs: it is an ' +
        'ordered list of steps, each with a number of seconds after the deadline and a target — the ' +
        'next eligible rep, the designated backup, or a manager (an admin or the owner). Only the steps ' +
        'that are due are applied, the level is recorded, and the new owner gets a fresh clock so the ' +
        'next step does not fire immediately. The ladder runs on a ticker every five seconds, and the ' +
        'Pipeline has a Run escalation check button for an on-demand pass.',
    },
    {
      sourceId: 'product-recovery',
      title: 'The recovery queue',
      text:
        'The Recovery queue lists every open lead that needs a person now, and states the reason per ' +
        'item. There are three reasons: it is still unacknowledged past its deadline, it has been ' +
        'escalated two or more times, or it has been untouched for longer than the workspace idle ' +
        'period (24 hours by default, set on Workspace settings). The list is ordered worst first — ' +
        'deepest past the deadline, then most escalated — and each item links to the lead and offers ' +
        'Acknowledge. Acknowledging a lead removes it from the queue.',
    },
    {
      sourceId: 'product-dashboard',
      title: 'The operational dashboard and what each figure means',
      text:
        'The Dashboard is read in one request so the tiles agree with each other. It shows new leads ' +
        'today, open pipeline value, average time to first response, the recovery-queue count, ' +
        'escalations in the last 24 hours, payments received this month and projected revenue, plus ' +
        'pipeline counts by stage and team availability. Time to first response is measured from when ' +
        'the lead was assigned to when it was acknowledged, and shows "no data yet" rather than zero ' +
        'when nothing has been answered. Payments received counts only payments confirmed by the ' +
        'provider this month; projected revenue counts open leads plus unpaid payment requests, and is ' +
        'never mixed into the collected figure. Escalations in 24 hours counts leads whose last ' +
        'escalation happened within a day.',
    },
    {
      sourceId: 'product-roles',
      title: 'Levels, roles, permissions and value masking',
      text:
        'A workspace has three base levels. An Owner holds every permission and cannot be modified by ' +
        'an Admin. An Admin holds the configuration permissions — create, edit, delete, export, manage ' +
        'assignment rules, manage integrations and view the audit log — but still cannot touch the ' +
        'Owner. A User starts with view and create only. Beyond the levels there are roles, which are ' +
        'named permission bundles, so a "Manager" role is just a role someone built. The permissions ' +
        'are: crm.view, crm.create, crm.edit, crm.delete, crm.export, assignment.manage, ' +
        'opportunity_value.view, integrations.manage and audit.view. An attached role replaces the ' +
        'level defaults, and explicit grants or revocations are applied on top. Opportunity value is ' +
        'hidden from anyone without opportunity_value.view: the server removes it from the lead list, ' +
        'the lead detail, the recovery queue, the dashboard and the statistics totals, and it omits ' +
        'the value column from the CSV export. The screen shows "Restricted" where the value would be. ' +
        'Only the last owner is protected from being demoted; promote someone else to Owner first.',
    },
    {
      sourceId: 'product-workspace-settings',
      title: 'Workspace settings: timers, ladder, members and roles',
      text:
        'Workspace settings has four parts. The acknowledgement section sets the acknowledge timer, the ' +
        'recovery-queue idle period, the per-member open-lead limit and the timezone. The escalation ' +
        'ladder lets you add, edit and remove steps, each a number of seconds after the deadline and a ' +
        'target, and saves them in order. Members shows each person with their level, role, open-lead ' +
        'limit, backup flag, availability, and how many permissions they hold, and lets someone with ' +
        'assignment.manage change them. Roles and permissions lets you create a role from the ' +
        'permission catalogue, tick permissions on an existing role, or delete it; the Invite form adds ' +
        'an existing account by email — the person must have signed in once with Google — and refuses to ' +
        'invite someone at or above your own level. The page also shows your own effective permissions ' +
        'so you can see what the server will allow.',
    },
    {
      sourceId: 'product-integrations',
      title: 'Integrations: WhatsApp, Google Calendar, alerts and payments',
      text:
        'Integrations shows every connector and its real state. WhatsApp links one number per ' +
        'workspace: Connect starts a session, a QR appears and refreshes itself, and once scanned the ' +
        'session is stored per workspace so it survives a deploy and never asks for another scan until ' +
        'you unlink it. The page shows the linked device, when it was linked, messages received and ' +
        'replied, the last message, the size on disk and how many live sessions the server is running ' +
        '(four by default). Google Calendar connects a Google account for appointment booking; the ' +
        'page shows the account, the last booking and the exact redirect URI the OAuth client must ' +
        'list. Alert channels take a generic webhook URL, a Slack webhook URL, or a Telegram bot token ' +
        'and chat id; every escalation attempt is recorded as sent, failed or skipped, and the recent ' +
        'attempts are listed. Payments shows whether card (Stripe) and crypto are configured, and the ' +
        'mode each is in. Connecting or changing these is permission-gated and written to the audit log.',
    },
    {
      sourceId: 'product-billing',
      title: 'Subscription, plans and invoices',
      text:
        'Every workspace has a subscription, created as a trial of the Starter plan on first use. The ' +
        'three plans are Starter, Growth and Scale. Starter includes three seats and one pipeline, ' +
        'Growth includes ten seats and three pipelines, and Scale includes a hundred seats and ' +
        'twenty-five pipelines, with stored-lead limits of one thousand, ten thousand and two hundred ' +
        'and fifty thousand respectively. On the Subscription screen you see the current plan and ' +
        'status, how many seats and stored leads are used against the limit, an open payment if one is ' +
        'waiting, a plan chooser, and the invoice list. Paying with a card opens Stripe\'s hosted ' +
        'checkout, so card details never reach this server; paying with crypto shows a deposit address ' +
        'and the exact amount. The payment confirms itself when Stripe reports the session as paid or ' +
        'when the deposit is matched, and the subscription becomes active for the period. Cancel keeps ' +
        'access until the period ends, and Resume undoes it.',
    },
    {
      sourceId: 'product-alerts-audit',
      title: 'Alert delivery and the audit log',
      text:
        'When a lead is created, escalated or left unacknowledged, the server sends an alert through ' +
        'whichever channel the workspace configured. Each attempt is stored with its status — sent, ' +
        'failed or skipped — and the error if there was one, and the most recent attempts are listed ' +
        'on Integrations. If no channel is configured the attempt is recorded as skipped rather than ' +
        'silently dropped. Separately, the audit log records assignments, acknowledgements, ' +
        'escalations, reassignments, member and role changes, settings changes, integration ' +
        'connections, exports and deletions, with who did it, when and what changed. It is a hash ' +
        'chain: each entry commits to the previous one, so an edit or a deletion breaks the chain and ' +
        'is detectable. It is readable only with audit.view and cannot be edited or deleted through any ' +
        'endpoint.',
    },
    {
      sourceId: 'product-voice',
      title: 'The voice assistant page',
      text:
        'The Voice screen lets you speak a question. The browser runs voice-activity detection so ' +
        'recording starts and stops on speech, sends 16 kHz mono WAV to the AI service, which ' +
        'transcribes it with Whisper, retrieves the most relevant product notes, answers in one or two ' +
        'spoken sentences, and returns audio you can replay. A microphone permission prompt is ' +
        'expected the first time. If the voice service is down the page says so; the AI service is a ' +
        'separate container from the API. Questions about this product are answered from the product ' +
        'notes, and questions that are not about the product are answered normally.',
    },
    {
      sourceId: 'product-troubleshooting',
      title: 'Common problems and what they actually mean',
      text:
        'Google sign-in fails with 400 redirect_uri_mismatch: the OAuth client does not list the exact ' +
        'callback URL. This deployment sends https://nascon.artdevelopers.site/api/auth/google/callback ' +
        'for sign-in and https://nascon.artdevelopers.site/api/calendar/callback for the calendar; both ' +
        'must be in the client\'s Authorised redirect URIs, character for character, and the API prints ' +
        'them on every boot. The sign-in page also publishes them under the redirect_uri_mismatch help. ' +
        'WhatsApp asks to link again: the stored session was unlinked on the phone or the profile was ' +
        'deleted; reconnect from Integrations. A lead value shows Restricted: your role lacks ' +
        'opportunity_value.view, and the value is not in the response at all. A payment refused with 402 ' +
        'or a limit message means the workspace subscription needs an upgrade or renewal. The site ' +
        'showing a deployment panel means the pipeline is replacing containers; it clears itself when ' +
        'the new version is healthy.',
    },
    {
      sourceId: 'product-not-built',
      title: 'What is not built yet',
      text:
        'Honesty matters more than a good answer: separate Company and Contact records do not exist ' +
        'yet — a lead is the single CRM record and carries the contact details itself. Custom fields, ' +
        'saved lists, multiple configurable pipelines, a conversations inbox, an appointments list and ' +
        'upcoming-appointments figure, payment requests attached to a lead, refunds, and Twilio are not ' +
        'built yet. The calendar connection is per workspace rather than per employee, and the signed ' +
        'document / knowledge pages were removed. If asked for one of these, say it is not built yet ' +
        'and name the closest thing that is: the pipeline, the recovery queue, the lead activity ' +
        'history, and the integrations page.',
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
