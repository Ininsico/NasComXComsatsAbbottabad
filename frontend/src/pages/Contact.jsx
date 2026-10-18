import { CircleCheckBig, Clock, Mail, MapPin, Send } from 'lucide-react';
import { useState } from 'react';
import PageHero from '../components/PageHero.jsx';
import { useToast } from '../context/toastContext.js';
import { CONTACT } from '../data/site.js';
import { api } from '../lib/api.js';

const EMPTY_FORM = { name: '', email: '', company: '', message: '' };

export default function Contact() {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const update = (field) => (event) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Please enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Please enter a valid email address';
    }
    if (form.message.trim().length < 10) {
      nextErrors.message = 'Please give us at least a sentence or two';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      showToast({
        tone: 'error',
        title: 'Check the form',
        message: 'Some fields still need your attention.',
      });
      return;
    }

    setSending(true);

    try {
      await api.demoRequest(form);
      setSent(true);
      setForm(EMPTY_FORM);
      showToast({
        tone: 'success',
        title: 'Request received',
        message: 'It is in the pipeline — we reply within one working day.',
      });
    } catch (error) {
      showToast({ tone: 'error', title: 'Could not send', message: error.message });
      setErrors(error.fields ?? {});
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHero
        title="Book a demo"
        description="Tell us how your team captures leads today and we will show you the pipeline with your own data. One working day to reply."
      />

      <section className="section">
        <div className="container contact-grid">
          <div className="card">
            <span className="label-micro">Talk to sales</span>
            <h2 style={{ marginTop: '0.25rem' }}>
              {sent ? 'Request received' : 'Send us a message'}
            </h2>

            {sent ? (
              <div>
                <p className="alert alert--success">
                  <CircleCheckBig size={15} aria-hidden="true" />
                  Your request is in the pipeline with a source of “website”. We will reply within one
                  working day.
                </p>
                <p className="muted" style={{ fontSize: '0.875rem' }}>
                  Want to skip the queue? Create an account and start with the free tier now.
                </p>
                <button type="button" className="btn btn-secondary" onClick={() => setSent(false)}>
                  Send another message
                </button>
              </div>
            ) : (
              <form className="form" onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="contact-name">Your name</label>
                  <input
                    id="contact-name"
                    className="input"
                    name="name"
                    value={form.name}
                    onChange={update('name')}
                    aria-invalid={Boolean(errors.name)}
                    autoComplete="name"
                  />
                  {errors.name ? <span className="field-error">{errors.name}</span> : null}
                </div>

                <div className="field">
                  <label htmlFor="contact-email">Work email</label>
                  <input
                    id="contact-email"
                    className="input"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={update('email')}
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="email"
                  />
                  {errors.email ? <span className="field-error">{errors.email}</span> : null}
                </div>

                <div className="field">
                  <label htmlFor="contact-company">Company</label>
                  <input
                    id="contact-company"
                    className="input"
                    name="company"
                    value={form.company}
                    onChange={update('company')}
                    autoComplete="organization"
                  />
                </div>

                <div className="field">
                  <label htmlFor="contact-message">What are you trying to fix?</label>
                  <textarea
                    id="contact-message"
                    className="textarea"
                    name="message"
                    value={form.message}
                    onChange={update('message')}
                    aria-invalid={Boolean(errors.message)}
                    placeholder="How many people sell, where do leads come from today, and what falls through?"
                  />
                  {errors.message ? <span className="field-error">{errors.message}</span> : null}
                </div>

                <div>
                  <button type="submit" className="btn btn-primary" disabled={sending}>
                    <Send size={15} aria-hidden="true" />
                    {sending ? 'Sending…' : 'Send request'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <aside className="panel">
            <span className="label-micro">Reach us</span>
            <h3 style={{ marginTop: '0.25rem' }}>Sales and support</h3>

            <ul className="info-list info-list--inline">
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.sales}`}>{CONTACT.sales}</a>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
              <li>
                <MapPin size={15} aria-hidden="true" />
                <span>{CONTACT.address}</span>
              </li>
              <li>
                <Clock size={15} aria-hidden="true" />
                <span>{CONTACT.hours}</span>
              </li>
            </ul>

            <hr className="divider" />

            <span className="label-micro">Prefer to start now?</span>
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              The free tier is a real pipeline, not a trial that expires. Create an account, import a
              CSV, and invite the team.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
