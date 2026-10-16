import { Router } from 'express';
import { memberNamespace, SHARED_NAMESPACE } from '../../../AI/src/index.js';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
import pipeline, { store } from '../lib/knowledge.js';

const router = Router();

const MAX_DOCUMENT = 20000;

router.get('/namespace', requireAuth, async (req, res) => {
  const namespace = memberNamespace(req.user.id);

  const [sources, namespaces, vectorBackend] = await Promise.all([
    pipeline.sources(namespace),
    pipeline.namespaces(),
    store.describe(),
  ]);

  res.json({
    namespace,
    sharedNamespace: SHARED_NAMESPACE,
    sources,
    namespaces,
    vectorBackend,
    stats: pipeline.stats(),
    retrieval: { topK: config.rag.topK, minScore: config.rag.minScore },
  });
});

router.post('/documents', requireAuth, async (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  const text = String(req.body?.text ?? '').trim();

  if (title.length < 2) {
    return res.status(400).json({ error: 'Give the document a title' });
  }

  if (text.length < 20) {
    return res.status(400).json({ error: 'Add at least a sentence of content' });
  }

  if (text.length > MAX_DOCUMENT) {
    return res.status(400).json({ error: `Keep documents under ${MAX_DOCUMENT} characters` });
  }

  const namespace = memberNamespace(req.user.id);
  const sourceId = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const document = await pipeline.ingest({
    namespace,
    sourceId,
    title,
    text,
    metadata: { addedBy: req.user.email, addedAt: new Date().toISOString() },
  });

  return res.status(201).json({ document });
});

router.delete('/documents/:sourceId', requireAuth, async (req, res) => {
  const namespace = memberNamespace(req.user.id);
  const result = await pipeline.remove(namespace, req.params.sourceId);
  res.json(result);
});

router.post('/ask', requireAuth, async (req, res) => {
  if (!config.groq.configured) {
    return res.status(503).json({ error: 'The assistant is not configured on the server' });
  }

  const question = String(req.body?.question ?? '').trim();

  if (question.length < 3) {
    return res.status(400).json({ error: 'Ask a longer question' });
  }

  if (question.length > 600) {
    return res.status(400).json({ error: 'Keep questions under 600 characters' });
  }

  try {
    const result = await pipeline.answer({
      userId: req.user.id,
      question,
      topK: config.rag.topK,
      minScore: config.rag.minScore,
    });

    return res.json(result);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

/** Retrieval only — useful for seeing exactly what a member's space returns. */
router.get('/retrieve', requireAuth, async (req, res) => {
  const question = String(req.query.q ?? '').trim();

  if (!question) {
    return res.status(400).json({ error: 'Pass ?q=your question' });
  }

  const hits = await pipeline.search({
    userId: req.user.id,
    question,
    topK: config.rag.topK,
    minScore: 0,
  });

  return res.json({ question, hits });
});

export default router;
