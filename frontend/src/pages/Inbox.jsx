import { MessageCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { messagesApi } from '../lib/api.js';

/**
 * The conversations inbox: every recorded message across the workspace, newest first, with
 * the person it belongs to. It is a reading surface — sending happens on the contact page,
 * where the opt-out state and the lead's history are in front of you.
 */
export default function Inbox() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState(null);

  const fetchAll = useCallback(async () => {
    const payload = await messagesApi.list(token, { limit: 200 });

    return payload.messages ?? [];
  }, [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(setMessages)
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load the inbox', message: error.message }),
        ),
    [fetchAll, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .catch((error) => {
        if (active) showToast({ tone: 'error', title: 'Could not load the inbox', message: error.message });
      });

    return () => {
      active = false;
    };
  }, [fetchAll, showToast]);

  if (!messages) return <p className="hint">Loading the inbox…</p>;

  const inbound = messages.filter((message) => message.direction === 'inbound').length;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Inbox</h1>
          <p>
            <MessageCircle size={13} aria-hidden="true" /> {messages.length} message(s), {inbound}{' '}
            inbound. Inbound unknown numbers become a contact and a lead on their own.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {messages.length === 0 ? (
        <p className="hint">
          Nothing recorded yet. Messages appear here once the workspace links a WhatsApp number and
          someone writes in.
        </p>
      ) : (
        <ul className="voice-log">
          {messages.map((message) => (
            <li className="voice-turn" key={message.id}>
              <span className="label-micro">
                {message.direction} · {message.provider} ·{' '}
                {new Date(message.at).toLocaleString()}
                {message.status && message.status !== 'received' ? ` · ${message.status}` : ''}
              </span>

              <p style={{ margin: '0.25rem 0' }}>{message.body}</p>

              <p className="hint" style={{ margin: 0 }}>
                {message.contactId ? (
                  <Link to={`/contacts/${message.contactId}`}>
                    {message.contactName || message.contactPhone || 'contact'}
                  </Link>
                ) : (
                  'unknown sender'
                )}
                {message.leadId ? (
                  <>
                    {' · '}
                    <Link to={`/crm/${message.leadId}`}>open the lead</Link>
                  </>
                ) : null}
                {message.optedOut ? (
                  <span className="pill pill--problem" style={{ marginLeft: '0.4rem' }}>
                    <ShieldAlert size={12} aria-hidden="true" />
                    opted out
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
