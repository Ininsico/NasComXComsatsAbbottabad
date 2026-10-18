import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { companiesApi } from '../lib/api.js';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { countdown } from '../lib/countdown.js';
import { CircleCheckBig, Clock, TriangleAlert } from 'lucide-react';

const money = (value) => `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function CompanyDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchAll = useCallback(async () => companiesApi.get(token, id), [id, token]);

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payload) => {
        if (active) setState(payload);
      })
      .catch((error) => {
        if (active) {
          showToast({ tone: 'error', title: 'Could not load the company', message: error.message });
        }
      });

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchAll, showToast]);

  if (!state) return <p className="hint">Loading company…</p>;

  const { company, contacts, opportunities } = state;

  return (
    <>
      <Link className="btn btn-ghost btn-sm" to="/companies">
        <ArrowLeft size={14} aria-hidden="true" />
        Companies
      </Link>

      <div className="dash-head" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1>{company.name}</h1>
          <p>
            {[company.industry, company.domain, company.phone].filter(Boolean).join(' · ') ||
              'no details yet'}
          </p>
        </div>
      </div>

      <section className="dash-section">
        <h2 className="dash-section__title">Contacts ({contacts.length})</h2>

        {contacts.length === 0 ? (
          <p className="hint">Nobody here yet. Create a contact, or capture a lead with this company.</p>
        ) : (
          <ul className="voice-log">
            {contacts.map((contact) => (
              <li className="voice-turn" key={contact.id}>
                <Link to={`/contacts/${contact.id}`}>
                  <strong>{contact.name}</strong>
                </Link>
                <span className="hint">
                  {' '}
                  · {[contact.title, contact.email].filter(Boolean).join(' · ') || 'no details'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Opportunities ({opportunities.length})</h2>

        {opportunities.length === 0 ? (
          <p className="hint">Nothing on the pipeline for this company yet.</p>
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
                    {lead.valueHidden ? 'value restricted' : lead.value > 0 ? money(lead.value) : 'no value'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
