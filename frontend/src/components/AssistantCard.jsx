import { Bot, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { api } from '../lib/api.js';

const SUGGESTIONS = [
  'When do Fall 2026 admissions close?',
  'What are the entry requirements for BS Computer Science?',
  'How many credit hours does a bachelor’s programme need?',
];

export default function AssistantCard() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);

  async function ask(rawQuestion) {
    const value = String(rawQuestion ?? question).trim();

    if (value.length < 3) {
      showToast({
        tone: 'pending',
        title: 'Ask a longer question',
        message: 'Give the assistant a full sentence to work with.',
      });
      return;
    }

    setAsking(true);
    setAnswer(null);

    try {
      const result = await api.aiAsk(token, value);
      setQuestion(value);
      setAnswer({
        text: result.answer,
        model: result.model,
        retrieved: result.retrieved ?? 0,
        sources: result.sources ?? [],
      });
    } catch (error) {
      showToast({ tone: 'error', title: 'Assistant unavailable', message: error.message });
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="card">
      <div className="assistant__head">
        <span className="tile__icon" aria-hidden="true">
          <Bot size={17} />
        </span>
        <div>
          <span className="label-micro">Campus assistant</span>
          <h3 style={{ margin: 0 }}>Ask about programmes, dates and policies</h3>
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
          placeholder="e.g. When is the entrance test?"
          aria-label="Your question"
        />
        <button type="submit" className="btn btn-primary" disabled={asking}>
          <Send size={15} aria-hidden="true" />
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </form>

      <div className="assistant__suggestions">
        {SUGGESTIONS.map((item) => (
          <button
            type="button"
            key={item}
            className="chip"
            onClick={() => ask(item)}
            disabled={asking}
          >
            <Sparkles size={12} aria-hidden="true" />
            {item}
          </button>
        ))}
      </div>

      {asking ? (
        <div className="skeleton skeleton--row" style={{ marginTop: '1rem' }} aria-hidden="true" />
      ) : null}

      {answer ? (
        <div className="assistant__answer" role="status">
          <p>{answer.text}</p>
          <span className="hint">
            {answer.model} · retrieved {answer.retrieved} passage(s) from your knowledge space
          </span>
          {answer.sources.length > 0 ? (
            <ul className="knowledge-sources">
              {answer.sources.map((source) => (
                <li key={`${source.title}-${source.scope}`}>
                  <span className={`pill ${source.scope === 'campus' ? 'pill--info' : 'pill--done'}`}>
                    {source.scope}
                  </span>
                  {source.title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
