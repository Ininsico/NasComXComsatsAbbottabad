import { Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { useState } from 'react';
import PageHero from '../components/PageHero.jsx';
import { useToast } from '../context/toastContext.js';
import { CONTACT } from '../data/site.js';

const EMPTY_FORM = { name: '', email: '', subject: 'Admissions enquiry', message: '' };

export default function Contact() {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const update = (field) => (event) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  function handleSubmit(event) {
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

    setForm(EMPTY_FORM);
    showToast({
      tone: 'success',
      title: 'Message sent',
      message: 'The administration office will reply within one working day.',
    });
  }

  return (
    <>
      <PageHero
        title="Contact us"
        description="Questions about admissions, fees, transcripts or hostel facilities? Send us a message or call the administration office."
      />

      <section className="section">
        <div className="container contact-grid">
          <div className="card">
            <span className="label-micro">Send a message</span>
            <h2 style={{ marginTop: '0.25rem' }}>We reply within one working day</h2>

            <form className="form" onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="contact-name">Full name</label>
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
                <label htmlFor="contact-email">Email address</label>
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
                <label htmlFor="contact-subject">Subject</label>
                <select
                  id="contact-subject"
                  className="select"
                  name="subject"
                  value={form.subject}
                  onChange={update('subject')}
                >
                  <option>Admissions enquiry</option>
                  <option>Fee &amp; scholarship</option>
                  <option>Transcript or documents</option>
                  <option>Hostel &amp; transport</option>
                  <option>Something else</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="contact-message">Message</label>
                <textarea
                  id="contact-message"
                  className="textarea"
                  name="message"
                  value={form.message}
                  onChange={update('message')}
                  aria-invalid={Boolean(errors.message)}
                  placeholder="Tell us what you need help with, and include your registration number if you have one."
                />
                {errors.message ? <span className="field-error">{errors.message}</span> : null}
              </div>

              <div>
                <button type="submit" className="btn btn-primary">
                  <Send size={15} aria-hidden="true" />
                  Send message
                </button>
              </div>
            </form>
          </div>

          <aside className="panel">
            <span className="label-micro">Campus office</span>
            <h3 style={{ marginTop: '0.25rem' }}>COMSATS Abbottabad</h3>

            <ul className="info-list info-list--inline">
              <li>
                <MapPin size={15} aria-hidden="true" />
                <span>{CONTACT.address}</span>
              </li>
              <li>
                <Phone size={15} aria-hidden="true" />
                <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>{CONTACT.phone}</a>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.admissionsEmail}`}>{CONTACT.admissionsEmail}</a>
              </li>
              <li>
                <Clock size={15} aria-hidden="true" />
                <span>{CONTACT.hours}</span>
              </li>
            </ul>

            <hr className="divider" />

            <span className="label-micro">Finding us</span>
            <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>
              The campus is on Park Road, roughly 4 km from Abbottabad city centre. Public transport
              and the campus shuttle both stop at the main gate.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
