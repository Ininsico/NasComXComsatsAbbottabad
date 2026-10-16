import { Boxes, FileText, Send, Sparkles, Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import AsyncSection from '../components/AsyncSection.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';

const EXAMPLES = [
  'When do Fall 2026 admissions close?',
  'What is the minimum attendance requirement?',
  'What is my fee voucher amount?',
];

export default function Knowledge() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const loadNamespace = useCallback(() => api.aiNamespace(token), [token]);
  const { data, error, loading, reload } = useApiResource(loadNamespace);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);

  const [draft, setDraft] = useState({ title: '', text: '' });
  const [saving, setSaving] = useState(false);

  const sources = data?.sources ?? [];
  const chunks = sources.reduce((total, source) => total + source.chunks, 0);

  async function ask(value) {
    const text = String(value ?? question).trim();

    if (text.length < 3) {
      showToast({ tone: 'pending', title: 'Ask a longer question', message: 'Use a full sentence.' });
      return;
    }

    setAsking(true);
    setAnswer(null);

    try {
      const result = await api.aiAsk(token, text);
      setQuestion(text);
      setAnswer(result);
    } catch (askError) {
      showToast({ tone: 'error', title: 'Assistant unavailable', message: askError.message });
    } finally {
      setAsking(false);
    }
  }

  async function handleIngest(event) {
    event.preventDefault();
    setSaving(true);

    try {
      const result = await api.aiIngest(token, {
        title: draft.title.trim(),
        text: draft.text.trim(),
      });
      showToast({
        tone: 'success',
        title: 'Indexed',
        message: `${result.document.title} was split into ${result.document.chunks} chunk(s) in your own vector space.`,
      });
      setDraft({ title: '', text: '' });
      reload();
    } catch (saveError) {
      showToast({ tone: 'error', title: 'Could not index', message: saveError.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(source) {
    try {
      await api.aiRemove(token, source.sourceId);
      showToast({ tone: 'success', title: 'Removed', message: `${source.title} left your vector space.` });
      reload();
    } catch (removeError) {
      showToast({ tone: 'error', title: 'Could not remove', message: removeError.message });
    }
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Knowledge base</h1>
          <p>
            Your own embedding space — {sources.length} document(s), {chunks} chunk(s). Campus
            knowledge is shared, your documents are private to you.
          </p>
        </div>
        {data ? (
          <div className="btn-row">
            <span className="pill pill--info">
              <Boxes size={12} aria-hidden="true" />
              {data.vectorBackend?.embedder?.dimensions ?? data.stats?.dimensions ?? 512} dimensions
            </span>
            <span
              className={`pill ${data.vectorBackend?.backend === 'chroma' ? 'pill--done' : 'pill--neutral'}`}
            >
              {data.vectorBackend?.backend === 'chroma' ? 'Chroma' : 'Built-in store'}
            </span>
            <span
              className={`pill ${data.vectorBackend?.embedder?.kind === 'semantic' ? 'pill--done' : 'pill--pending'}`}
            >
              {data.vectorBackend?.embedder?.kind === 'semantic'
                ? `semantic · ${data.vectorBackend.embedder.model ?? 'bge-small'}`
                : 'hashed fallback'}
            </span>
          </div>
        ) : null}
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        shape="cards"
        count={2}
        label="Loading your knowledge space"
        errorTitle="We could not load your knowledge space"
      >
        <div className="knowledge-grid">
          <section className="card">
            <div className="assistant__head">
              <span className="tile__icon" aria-hidden="true">
                <Sparkles size={17} />
              </span>
              <div>
                <span className="label-micro">Retrieval-augmented answers</span>
                <h3 style={{ margin: 0 }}>Ask your knowledge base</h3>
              </div>
            </div>

            <form
              className="assistant__form"
              onSubmit={(event) => {
                event.preventDefault();
                ask();
              }}
            >
              <input
                className="input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="e.g. What is my fee voucher amount?"
                aria-label="Your question"
              />
              <button type="submit" className="btn btn-primary" disabled={asking}>
                <Send size={15} aria-hidden="true" />
                {asking ? 'Retrieving…' : 'Ask'}
              </button>
            </form>

            <div className="assistant__suggestions">
              {EXAMPLES.map((example) => (
                <button
                  type="button"
                  key={example}
                  className="chip"
                  onClick={() => ask(example)}
                  disabled={asking}
                >
                  <Sparkles size={12} aria-hidden="true" />
                  {example}
                </button>
              ))}
            </div>

            {asking ? (
              <div className="skeleton skeleton--row" style={{ marginTop: '1rem' }} aria-hidden="true" />
            ) : null}

            {answer ? (
              <div className="assistant__answer" role="status">
                <p>{answer.answer}</p>
                <span className="hint">
                  {answer.model} · retrieved {answer.retrieved} passage(s)
                </span>
                {answer.sources?.length ? (
                  <ul className="knowledge-sources">
                    {answer.sources.map((source) => (
                      <li key={`${source.title}-${source.scope}`}>
                        <span className={`pill ${source.scope === 'campus' ? 'pill--info' : 'pill--done'}`}>
                          {source.scope}
                        </span>
                        {source.title}
                        <span className="hint"> · score {source.score}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card">
            <span className="label-micro">Add to your private space</span>
            <h3 style={{ marginTop: '0.25rem' }}>Index a document</h3>

            <form className="form" onSubmit={handleIngest} style={{ marginTop: '0.75rem' }}>
              <div className="field">
                <label htmlFor="knowledge-title">Title</label>
                <input
                  id="knowledge-title"
                  className="input"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, title: event.target.value }))
                  }
                  placeholder="e.g. My semester 6 fee letter"
                />
              </div>

              <div className="field">
                <label htmlFor="knowledge-text">Content</label>
                <textarea
                  id="knowledge-text"
                  className="textarea"
                  value={draft.text}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, text: event.target.value }))
                  }
                  placeholder="Paste the text. It is chunked, embedded and stored only in your namespace."
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Upload size={15} aria-hidden="true" />
                {saving ? 'Indexing…' : 'Index document'}
              </button>
            </form>
          </section>
        </div>

        <section className="dash-section">
          <h2 className="dash-section__title">
            <FileText size={17} aria-hidden="true" />
            Documents in your space
          </h2>

          {sources.length === 0 ? (
            <p className="alert alert--info">
              <FileText size={15} aria-hidden="true" />
              Nothing indexed yet. Add a document above and it becomes searchable immediately.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Chunks</th>
                    <th scope="col">Indexed</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => (
                    <tr key={source.sourceId}>
                      <th scope="row">{source.title}</th>
                      <td>{source.chunks}</td>
                      <td>{formatDateTime(source.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          onClick={() => handleRemove(source)}
                          aria-label={`Remove ${source.title}`}
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dash-section">
          <h2 className="dash-section__title">
            <Boxes size={17} aria-hidden="true" />
            Vector spaces
          </h2>
          <div className="table-wrap">
            <table className="table">
              <caption>Each namespace is searched separately</caption>
              <thead>
                <tr>
                  <th scope="col">Namespace</th>
                  <th scope="col">Chunks</th>
                  <th scope="col">Sources</th>
                </tr>
              </thead>
              <tbody>
                {(data?.namespaces ?? []).map((entry) => (
                  <tr key={entry.namespace}>
                    <th scope="row" style={{ fontFamily: 'var(--font-mono)' }}>
                      {entry.namespace}
                      {entry.namespace === data?.namespace ? ' (yours)' : ''}
                      {entry.namespace === data?.sharedNamespace ? ' (campus)' : ''}
                    </th>
                    <td>{entry.chunks}</td>
                    <td>{entry.sources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </AsyncSection>
    </>
  );
}
