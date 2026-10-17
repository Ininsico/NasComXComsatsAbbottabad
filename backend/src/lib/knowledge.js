import { ChromaClient } from 'chromadb';
import { createAdaptiveStore, createRagPipeline, SHARED_NAMESPACE } from '../../../AI/src/index.js';
import { config } from '../config.js';
import { ANNOUNCEMENTS, FACULTY, PROGRAMS } from '../data/campus.js';

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

function campusDocuments() {
  return [
    {
      sourceId: 'campus-programmes',
      title: 'Programmes on offer',
      text: PROGRAMS.map(
        (programme) =>
          `${programme.name} — ${programme.faculty}, ${programme.level}, ${programme.duration}, ` +
          `${programme.credits} credit hours, ${programme.seats} seats. Entry requirement: ` +
          `${programme.requirement}. Admission test: ${programme.test}. ${programme.summary}`,
      ).join('\n'),
    },
    {
      sourceId: 'campus-faculty',
      title: 'Faculty directory',
      text: FACULTY.map(
        (member) =>
          `${member.name} — ${member.designation}, ${member.department}. Research focus: ` +
          `${member.focus}. Office: ${member.office}. Email: ${member.email}.`,
      ).join('\n'),
    },
    {
      sourceId: 'campus-announcements',
      title: 'Campus announcements',
      text: ANNOUNCEMENTS.map(
        (item) => `[${item.date}] ${item.title} (${item.category}, for ${item.audience}): ${item.body}`,
      ).join('\n'),
    },
    {
      sourceId: 'campus-policies',
      title: 'Policies, dates and contacts',
      text:
        'Campus: COMSATS University Islamabad, Abbottabad Campus, Park Road, Abbottabad, Khyber Pakhtunkhwa, Pakistan.\n\n' +
        'Administration office hours are Monday to Friday, 8:30 AM to 4:30 PM. Phone +92 992 383 591. ' +
        'General email info@comsats-abbottabad.edu.pk. Admissions email admissions@comsats-abbottabad.edu.pk.\n\n' +
        'Fall 2026 admissions: applications open 1 June 2026, close 31 July 2026. Entrance test 9 August 2026. ' +
        'First merit list 18 August 2026. Classes begin 8 September 2026.\n\n' +
        'Admission steps: create an applicant account, submit the online form, upload documents, pay the ' +
        'processing fee, merit list and interview, then confirm admission by paying the semester fee.\n\n' +
        'Attendance: students must maintain at least 75% attendance in every course. Falling below this ' +
        'threshold raises an automatic warning in the portal and can bar a student from the final examination.\n\n' +
        'Assessment: each course carries sessional marks (quizzes, assignments, attendance) and a final ' +
        'examination. Sessional weightage is typically 40 to 50 percent. A minimum of 136 credit hours and a ' +
        'CGPA of 2.0 are required to graduate.\n\n' +
        'Fees: a full undergraduate semester currently costs about 142,000 PKR, covering tuition and campus ' +
        'charges. Merit scholarships waive tuition for the top student each semester, and means-tested support ' +
        'plus interest-free instalment plans are available on written application to the campus director.\n\n' +
        'Campus facilities: central library open until 8 PM with over 42,000 titles, six computing labs with ' +
        '240 workstations, engineering workshops, sports complex and a subsidised cafeteria.\n\n' +
        'Faculty support hours: Monday and Wednesday 10:00 AM to 12:00 PM at departmental offices; Tuesday and ' +
        'Thursday 2:00 PM to 4:00 PM by appointment through the portal; Friday research supervision only.',
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
export async function seedCampusKnowledge() {
  const semanticReady = await waitForEmbeddings();

  if (config.rag.useSemantic && !semanticReady) {
    console.warn(
      'RAG: the embeddings service never answered — indexing with the hashed fallback, retrieval quality will be lower',
    );
  }

  const result = await pipeline.ingestMany({
    namespace: SHARED_NAMESPACE,
    documents: campusDocuments(),
  });

  return result;
}
