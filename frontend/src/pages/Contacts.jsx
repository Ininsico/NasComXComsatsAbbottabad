import { Info, Plus, RefreshCw, Search, ShieldAlert, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contactsApi } from '../lib/api.js';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';

const EMPTY = { name: '', email: '', phone: '', title: '' };

/**
 * The contact list. Every row names the company it sits under and how many opportunities
 * it is on, so the person is findable before "the deal" is.
 */
export default function Contacts() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  const fetchAll = useCallback(
    () =>
      contactsApi.all(token).then((payload) => {
        setContacts(payload.contacts ?? []);
        return payload.contacts ?? [];
      }),
    [token],
  );

  const refresh = useCallback(
    () =>
      fetchAll()
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load contacts', message: error.message }),
        ),
    [fetchAll, showToast],
  );

  useEffect(() => {
    fetchAll()
      .then((list) => {
        // The create gate mirrors what the server will refuse, so a User level sees it up front.
        setCanCreate(true);
        return list;
      })
      .catch(() => {});
  }, [fetchAll]);

  async function createContact(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const result = await contactsApi.create(token, form);

      setForm(EMPTY);
      await refresh();
      showToast({ tone: 'success', title: 'Contact created' });
      return result;
    } catch (createError) {
      showToast({
        tone: 'error',
        title: 'Could not create the contact',
        message: createError.message,
      });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const rows = needle
    ? contacts.filter((contact) =>
        [contact.name, contact.email, contact.phone, contact.companyName]
          .some((field) => String(field ?? '').toLowerCase().includes(needle)),
      )
    : contacts;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Contacts</h1>
          <p>{contacts.length} person(s). A person can hold several opportunities.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">
          <UserRound size={12} aria-hidden="true" /> New contact
        </span>
        <form
          className="form"
          style={{ marginTop: '0.5rem' }}
          onSubmit={createContact}
        >
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="c-name">Name</label>
              <input
                id="c-name"
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input
                id="c-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Phone</label>
              <input
                id="c-phone"
                className="input"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy || !canCreate}>
            <Plus size={15} aria-hidden="true" />
            {busy ? 'Creating…' : 'Create contact'}
          </button>
        </form>
      </section>

      {contacts.length === 0 ? (
        <p className="alert alert--info">
          <Info size={15} aria-hidden="true" />
          No contacts yet. They appear on their own when a lead arrives with a phone number or an
          email — capture by form, WhatsApp or by hand.
        </p>
      ) : null}

      {contacts.length > 0 ? (
        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <label className="input-icon" style={{ flex: 1, maxWidth: 320 }}>
            <Search size={15} aria-hidden="true" />
            <input
              className="input"
              placeholder="Search by name, email, phone or company"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Contact</th>
                <th scope="col">Company</th>
                <th scope="col">Opportunities</th>
                <th scope="col">Messaging</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((contact) => (
                <tr key={contact.id}>
                  <th scope="row">
                    <Link to={`/contacts/${contact.id}`}>
                      <strong>{contact.name}</strong>
                    </Link>
                    <br />
                    <span className="hint">
                      {[contact.email, contact.phone].filter(Boolean).join(' · ') || 'no details'}
                    </span>
                  </th>
                  <td>{contact.companyName ?? '—'}</td>
                  <td>{contact.opportunityCount}</td>
                  <td>
                    {contact.optOut?.whatsapp ? (
                      <span className="pill pill--problem" title={contact.optOut.reason ?? undefined}>
                        <ShieldAlert size={12} aria-hidden="true" />
                        opted out
                      </span>
                    ) : (
                      <span className="pill pill--done">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {contacts.length > 0 && rows.length === 0 ? <p className="hint">Nothing matches that search.</p> : null}
    </>
  );
}
