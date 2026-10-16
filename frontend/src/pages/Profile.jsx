import { BadgeCheck, IdCard, Mail, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

const TEXT_FIELDS = [
  { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '+92 300 1234567' },
  { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { name: 'address', label: 'Postal address', placeholder: 'House, street, area' },
  { name: 'city', label: 'City', placeholder: 'Abbottabad' },
  { name: 'guardianName', label: 'Guardian name', placeholder: 'Full name' },
  { name: 'guardianPhone', label: 'Guardian phone', type: 'tel', placeholder: '+92 300 7654321' },
  { name: 'programme', label: 'Programme', placeholder: 'BS Computer Science' },
  { name: 'section', label: 'Section', placeholder: 'A' },
];

const EMPTY_PROFILE = Object.fromEntries(
  [...TEXT_FIELDS.map((field) => field.name), 'bio'].map((name) => [name, '']),
);

function initials(name) {
  return String(name ?? '')
    .replace(/^(Prof\.|Dr\.|Ms\.|Mr\.|Mrs\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function Profile() {
  const { token, user: sessionUser } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState({ loading: true, error: null, account: null, context: null, completeness: null });
  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const avatarInput = useRef(null);

  useEffect(() => {
    let active = true;

    api
      .profile(token)
      .then((payload) => {
        if (!active) return;

        setState({
          loading: false,
          error: null,
          account: payload.user,
          context: payload.context,
          completeness: payload.completeness,
        });
        setForm({ ...EMPTY_PROFILE, ...payload.profile, name: payload.user.name });
      })
      .catch((error) => {
        if (active) {
          setState({ loading: false, error, account: null, context: null, completeness: null });
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const update = (field) => (event) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  async function handleSave(event) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);

    try {
      const result = await api.saveProfile(token, form);
      setForm({ ...EMPTY_PROFILE, ...result.profile, name: result.user.name });
      setState((previous) => ({
        ...previous,
        account: result.user,
        completeness: result.completeness,
        context: result.context,
      }));
      showToast({
        tone: 'success',
        title: 'Profile saved',
        message: `Your profile is ${result.completeness.percentage}% complete.`,
      });
    } catch (saveError) {
      if (saveError.fields) setFieldErrors(saveError.fields);
      showToast({ tone: 'error', title: 'Could not save', message: saveError.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const result = await api.uploadAvatar(token, file);
      setForm((previous) => ({ ...previous, avatarUrl: result.avatarUrl }));
      setState((previous) => ({ ...previous, account: { ...previous.account, avatarUrl: result.avatarUrl } }));
      showToast({ tone: 'success', title: 'Photo updated', message: 'Your profile photo is live.' });
    } catch (uploadError) {
      showToast({ tone: 'error', title: 'Upload failed', message: uploadError.message });
    } finally {
      setUploading(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Your profile</h1>
          <p>Keep your contact and guardian details up to date for the registrar.</p>
        </div>
        {state.completeness ? (
          <span
            className={`pill ${state.completeness.percentage === 100 ? 'pill--done' : 'pill--pending'}`}
          >
            <BadgeCheck size={12} aria-hidden="true" />
            {state.completeness.percentage}% complete
          </span>
        ) : null}
      </div>

      {state.loading ? (
        <div className="skeleton-grid">
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
        </div>
      ) : null}

      {state.error ? (
        <p className="alert alert--error">
          <Mail size={15} aria-hidden="true" />
          {state.error.message}
        </p>
      ) : null}

      {form ? (
        <div className="profile-grid">
          <aside className="profile-side">
            <section className="card">
              <span className="label-micro">Profile photo</span>
              <div className="profile-avatar">
                {form.avatarUrl ? (
                  <img src={form.avatarUrl} alt="" />
                ) : (
                  <span className="profile-avatar__initials" aria-hidden="true">
                    {initials(form.name || sessionUser.name)}
                  </span>
                )}
              </div>
              <input
                id="avatar-file"
                className="sr-only"
                type="file"
                accept="image/*"
                ref={avatarInput}
                onChange={handleAvatar}
              />
              <label className="btn btn-secondary btn-block" htmlFor="avatar-file">
                <Upload size={15} aria-hidden="true" />
                {uploading ? 'Uploading…' : 'Change photo'}
              </label>
              <p className="hint" style={{ margin: '0.5rem 0 0' }}>
                Stored on Cloudinary. JPG or PNG, up to 8 MB.
              </p>
            </section>

            <section className="card" style={{ marginTop: '1rem' }}>
              <span className="label-micro">From the campus record</span>
              <ul className="info-list info-list--inline" style={{ marginTop: '0.75rem' }}>
                <li>
                  <Mail size={15} aria-hidden="true" />
                  <span>{state.account?.email}</span>
                </li>
                <li>
                  <UserRound size={15} aria-hidden="true" />
                  <span>
                    {state.account?.role} · joined {formatDate(state.account?.createdAt)}
                  </span>
                </li>
                {state.context?.registrationNo ? (
                  <li>
                    <IdCard size={15} aria-hidden="true" />
                    <span>
                      {state.context.registrationNo} · {state.context.semester} · Section{' '}
                      {state.context.section}
                    </span>
                  </li>
                ) : null}
                {state.context?.advisor ? (
                  <li>
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>Advisor: {state.context.advisor}</span>
                  </li>
                ) : null}
                {state.context?.designation ? (
                  <li>
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>
                      {state.context.designation} · {state.context.department}
                    </span>
                  </li>
                ) : null}
              </ul>
              <p className="hint" style={{ margin: '0.75rem 0 0' }}>
                These come from the registrar and cannot be edited here.
              </p>
            </section>

            {state.completeness?.missing?.length ? (
              <section className="card" style={{ marginTop: '1rem' }}>
                <span className="label-micro">Still missing</span>
                <ul className="list-check" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  {state.completeness.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>

          <form className="card" onSubmit={handleSave} noValidate>
            <span className="label-micro">Your details</span>
            <h3 style={{ marginTop: '0.25rem' }}>Contact and guardian information</h3>

            <div className="profile-fields">
              <div className="field">
                <label htmlFor="profile-name">Full name</label>
                <input
                  id="profile-name"
                  className="input"
                  value={form.name ?? ''}
                  onChange={update('name')}
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoComplete="name"
                />
                {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : null}
              </div>

              {TEXT_FIELDS.map((field) => (
                <div className="field" key={field.name}>
                  <label htmlFor={`profile-${field.name}`}>{field.label}</label>
                  <input
                    id={`profile-${field.name}`}
                    className="input"
                    type={field.type ?? 'text'}
                    value={form[field.name] ?? ''}
                    onChange={update(field.name)}
                    placeholder={field.placeholder}
                    aria-invalid={Boolean(fieldErrors[field.name])}
                  />
                  {fieldErrors[field.name] ? (
                    <span className="field-error">{fieldErrors[field.name]}</span>
                  ) : null}
                </div>
              ))}

              <div className="field profile-fields__wide">
                <label htmlFor="profile-bio">About you</label>
                <textarea
                  id="profile-bio"
                  className="textarea"
                  value={form.bio ?? ''}
                  onChange={update('bio')}
                  placeholder="Interests, societies, or anything your advisor should know."
                />
                {fieldErrors.bio ? <span className="field-error">{fieldErrors.bio}</span> : null}
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: '1.25rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <BadgeCheck size={15} aria-hidden="true" />
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
