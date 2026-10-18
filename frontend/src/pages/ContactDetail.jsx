import { ArrowLeft, Send, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { contactsApi, messagesApi } from '../lib/api.js';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { countdown } from '../lib/countdown.js';
import { CircleCheckBig, Clock } from 'lucide-react';

const money = (value) => `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * One contact, complete: the person, the company they sit under, and every opportunity
 * they are on with its own clock. This is the page the spec asks the pipeline, payments and
 * conversations to hang off.
 */
export default function ContactDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchAll = useCallback(async () => {
    const [contactPayload, messagePayload] = await Promise.all([
      contactsApi.get(token, id),
      messagesApi.list(token, { contactId: id, limit: 50 }).catch(() => ({ messages: [] })),
    ]);

    return { contactPayload, messagePayload };
  }, [id, token]);

  useEffect(() => {
    let active = true;

    fetchAll()
      .then(({ contactPayload, messagePayload }) => {
        if (!active) return;
        setState(contactPayload);
        setMessages(messagePayload.messages ?? []);
      })
      .catch((error) => {
        if (active) showToast({ tone: 'error', title: 'Could not load the contact', message: error.message });
      });

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchAll, showToast]);

  /** Sends through the workspace's linked number, if it has one. */
  async function sendMessage(event) {
    event.preventDefault();
    setSending(true);

    try {
      // The nearest open opportunity on this contact, so the message lands on a lead too.
      const nearOpportunity = state.opportunities.find((lead) => !['won', 'lost'].includes(lead.stage));

      await messagesApi.send(token, {
        contactId: contact.id,
        leadId: nearOpportunity?.id ?? undefined,
        body: draft,
      });

      setDraft('');

      const { messagePayload } = await fetchAll();

      setMessages(messagePayload.messages ?? []);
      showToast({ tone: 'success', title: 'Message sent' });
    } catch (sendError) {
      showToast({ tone: 'error', title: 'Could not send', message: sendError.message });
    } finally {
      setSending(false);
    }
  }

  if (!state) return <p className="hint">Loading contact…</p>;

  const { contact, company, opportunities } = state;
  const activities = state.activities ?? [];

  return (
    <>
      <Link className="btn btn-ghost btn-sm" to="/contacts">
        <ArrowLeft size={14} aria-hidden="true" />
        Contacts
      </Link>

      <div className="dash-head" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1>{contact.name}</h1>
          <p>
            {company ? (
              <>
                {company.name} ·{' '}
              </>
            ) : (
              'No company · '
            )}
            {contact.email || 'no email'} · {contact.phone || 'no phone'}
            {contact.title ? ` · ${contact.title}` : ''}
          </p>
        </div>
      </div>

      {contact.optOut?.whatsapp ? (
        <p className="alert alert--error">
          <ShieldAlert size={15} aria-hidden="true" />
          This contact opted out of messaging on {new Date(contact.optOut.at).toLocaleString()} —{' '}
          {contact.optOut.reason ?? 'no reason recorded'}. They must not be messaged.
        </p>
      ) : null}

      <section className="dash-section">
        <h2 className="dash-section__title">Opportunities</h2>

        {opportunities.length === 0 ? (
          <p className="hint">
            Nothing on the pipeline for this person yet. Create a lead with their email or phone and
            it lands here.
          </p>
        ) : (
          <ul className="voice-log">
            {opportunities.map((lead) => {
              const clock = countdown(lead, now);

              return (
                <li className="voice-turn" key={lead.id}>
                  <Link to={`/crm/${lead.id}`}>
                    <strong>{lead.name}</strong>
                  </Link>
                  <span className="hint">
                    {' '}
                    · {lead.stage} · {lead.assigneeName ?? 'Unassigned'}
                  </span>

                  <p>
                    <span className={`countdown countdown--${clock.tone}`}>
                      {clock.tone === 'problem' ? (
                        <TriangleAlert size={12} aria-hidden="true" />
                      ) : clock.tone === 'done' ? (
                        <CircleCheckBig size={12} aria-hidden="true" />
                      ) : (
                        <Clock size={12} aria-hidden="true" />
                      )}
                      {clock.label}
                    </span>{' '}
                    ·{' '}
                    {lead.valueHidden ? (
                      'value restricted'
                    ) : lead.value > 0 ? (
                      money(lead.value)
                    ) : (
                      'no value'
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Conversations</h2>

        {contact.optOut?.whatsapp ? (
          <p className="alert alert--error">
            <ShieldAlert size={15} aria-hidden="true" />
            Opted out {contact.optOut.at ? `on ${new Date(contact.optOut.at).toLocaleString()}` : ''}
            {contact.optOut.reason ? ` — ${contact.optOut.reason}` : ''}. Messaging is blocked and the
            send form stays disabled.
          </p>
        ) : null}

        {messages.length === 0 ? (
          <p className="hint">
            Nothing recorded yet. Inbound messages on the linked number, and sends from here, both
            land in this thread.
          </p>
        ) : (
          <ul className="voice-log">
            {messages.map((message) => (
              <li className="voice-turn" key={message.id}>
                <span className="label-micro">
                  {message.direction} · {message.provider} ·{' '}
                  {new Date(message.at).toLocaleString()}{' '}
                  {message.status && message.status !== 'received' ? `· ${message.status}` : ''}
                </span>
                <p>{message.body}</p>

                {message.direction === 'outbound' && message.status === 'failed' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        await messagesApi.send(token, {
                          contactId: contact.id,
                          leadId: message.leadId ?? undefined,
                          body: message.body,
                        });

                        const { messagePayload } = await fetchAll();

                        setMessages(messagePayload.messages ?? []);
                        showToast({ tone: 'success', title: 'Message retried' });
                      } catch (retryError) {
                        showToast({ tone: 'error', title: 'Still failing', message: retryError.message });
                      }
                    }}
                  >
                    Retry this message
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form
          className="form"
          style={{ marginTop: '0.75rem' }}
          onSubmit={sendMessage}
        >
          <div className="field">
            <label htmlFor="contact-message">Send a WhatsApp message</label>
            <input
              id="contact-message"
              className="input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={contact.optOut?.whatsapp ? 'Messaging is blocked for this contact' : `To ${contact.phone || '—'}`}
              disabled={Boolean(contact.optOut?.whatsapp) || !contact.phone}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={sending || Boolean(contact.optOut?.whatsapp) || !contact.phone}>
            <Send size={14} aria-hidden="true" />
            {sending ? 'Sending…' : 'Send message'}
          </button>
          {!contact.phone ? <p className="hint">Add a phone number to reply on WhatsApp.</p> : null}
        </form>
      </section>
      <section className="dash-section">
        <h2 className="dash-section__title">History</h2>
        <p className="hint">
          Every recorded action across this person's opportunities, newest first — the same trail
          the lead page shows, merged here so the contact is the whole story.
        </p>

        {activities.length === 0 ? (
          <p className="hint">Nothing recorded yet.</p>
        ) : (
          <ul className="voice-log">
            {activities.slice(0, 50).map((entry, index) => (
              <li className="voice-turn" key={entry.id ?? index}>
                <span className="label-micro">
                  {entry.kind} · {entry.by} · {new Date(entry.at).toLocaleString()}
                </span>
                <p>{entry.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
