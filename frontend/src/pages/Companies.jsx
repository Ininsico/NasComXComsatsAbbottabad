import { Info, Plus, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { companiesApi } from '../lib/api.js';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';

const EMPTY = { name: '', domain: '', industry: '', phone: '' };

export default function Companies() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(
    () =>
      companiesApi
        .all(token)
        .then((payload) => {
          setCompanies(payload.companies ?? []);
          return payload.companies ?? [];
        })
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load companies', message: error.message }),
        ),
    [token, showToast],
  );

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function create(event) {
    event.preventDefault();
    setBusy(true);

    try {
      await companiesApi.create(token, form);
      setForm(EMPTY);
      await fetchAll();
      showToast({ tone: 'success', title: 'Company created' });
    } catch (createError) {
      showToast({ tone: 'error', title: 'Could not create the company', message: createError.message });
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const rows = needle
    ? companies.filter((company) =>
        [company.name, company.domain, company.industry].some((field) =>
          String(field ?? '').toLowerCase().includes(needle),
        ),
      )
    : companies;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Companies</h1>
          <p>{companies.length} company(ies). Every contact belongs to one.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchAll()}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">New company</span>
        <form className="form" style={{ marginTop: '0.5rem' }} onSubmit={create}>
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="co-name">Name</label>
              <input
                id="co-name"
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="co-domain">Domain</label>
              <input
                id="co-domain"
                className="input"
                placeholder="northwind.example"
                value={form.domain}
                onChange={(event) => setForm({ ...form, domain: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="co-industry">Industry</label>
              <input
                id="co-industry"
                className="input"
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Plus size={15} aria-hidden="true" />
            {busy ? 'Creating…' : 'Create company'}
          </button>
        </form>
      </section>

      {companies.length === 0 ? (
        <p className="alert alert--info">
          <Info size={15} aria-hidden="true" />
          No companies yet. One is created on its own when a lead arrives with a company name.
        </p>
      ) : null}

      {companies.length > 0 ? (
        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <label className="input-icon" style={{ flex: 1, maxWidth: 320 }}>
            <Search size={15} aria-hidden="true" />
            <input
              className="input"
              placeholder="Search by name, domain or industry"
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
                <th scope="col">Company</th>
                <th scope="col">Industry</th>
                <th scope="col">Contacts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((company) => (
                <tr key={company.id}>
                  <th scope="row">
                    <Link to={`/companies/${company.id}`}>
                      <strong>{company.name}</strong>
                    </Link>
                    <br />
                    <span className="hint">{company.domain || company.phone || '—'}</span>
                  </th>
                  <td>{company.industry || '—'}</td>
                  <td>{company.contactCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {companies.length > 0 && rows.length === 0 ? <p className="hint">Nothing matches that search.</p> : null}
    </>
  );
}
