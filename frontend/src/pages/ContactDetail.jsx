import { ArrowLeft, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { contactsApi } from '../lib/api.js';
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
  const [now, setNow] = useState(() => Date.now());

  const fetchAll = useCallback(async () => {
    const payload = await contactsApi.get(token, id);

    return payload;
  }, [id, token]);

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payload) => {
        if (active) setState(payload);
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

  if (!state) return <p className="hint">Loading contact…</p>;

  const { contact, company, opportunities } = state;

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
        <h2 className="dash-section__title">Conversations and payments</h2>
        <p className="hint">
          A WhatsApp conversation thread and the payments for this person are not wired to this page
          yet. Messages sent from the integrations page are recorded on their own connector.
        </p>
      </section>
    </>
  );
}
