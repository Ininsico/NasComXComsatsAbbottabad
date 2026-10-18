import { CalendarCheck, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { calendarApi } from '../lib/api.js';

/**
 * Appointments: every booking made from a lead, soonest first, split into what is coming
 * and what has passed. Cancelling removes the Google event first and only then records the
 * cancellation, so a calendar that still holds the meeting is never reported as cancelled.
 */
export default function Appointments() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [appointments, setAppointments] = useState(null);
  const [busy, setBusy] = useState('');
  const [now] = useState(() => Date.now());

  const fetchAll = useCallback(async () => {
    const payload = await calendarApi.appointments(token);

    return payload.appointments ?? [];
  }, [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(setAppointments)
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load appointments', message: error.message }),
        ),
    [fetchAll, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((rows) => {
        if (active) setAppointments(rows);
      })
      .catch((error) => {
        if (active) showToast({ tone: 'error', title: 'Could not load appointments', message: error.message });
      });

    return () => {
      active = false;
    };
  }, [fetchAll, showToast]);

  async function cancel(appointment) {
    setBusy(appointment.id);

    try {
      await calendarApi.cancelAppointment(token, appointment.id);
      showToast({ tone: 'success', title: 'Appointment cancelled' });
      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'Could not cancel', message: error.message });
    } finally {
      setBusy('');
    }
  }

  if (!appointments) return <p className="hint">Loading appointments…</p>;

  const upcoming = appointments.filter(
    (row) => row.status === 'booked' && Date.parse(row.start) >= now,
  );
  const past = appointments.filter(
    (row) => row.status !== 'booked' || Date.parse(row.start) < now,
  );

  const row = (appointment) => (
    <tr key={appointment.id}>
      <td>
        {new Date(appointment.start).toLocaleString()}
        <br />
        <span className="hint">{appointment.timeZone}</span>
      </td>
      <th scope="row">
        {appointment.leadId ? (
          <Link to={`/crm/${appointment.leadId}`}>{appointment.title}</Link>
        ) : (
          appointment.title
        )}
        <br />
        <span className="hint">{appointment.memberName || '—'}</span>
      </th>
      <td>
        <span className={`pill ${appointment.status === 'booked' ? 'pill--done' : 'pill--neutral'}`}>
          {appointment.status}
        </span>
      </td>
      <td>
        {appointment.status === 'booked' ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy === appointment.id}
            onClick={() => cancel(appointment)}
          >
            <X size={14} aria-hidden="true" />
            {busy === appointment.id ? 'Cancelling…' : 'Cancel'}
          </button>
        ) : null}
      </td>
    </tr>
  );

  const table = (rows) => (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">What</th>
            <th scope="col">Status</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row)}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <span className="hint">Nothing here.</span>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Appointments</h1>
          <p>
            <CalendarCheck size={13} aria-hidden="true" /> {appointments.length} booking(s),{' '}
            {upcoming.length} upcoming. Bookings are made from a lead, so they carry its owner and
            history.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <section className="dash-section">
        <h2 className="dash-section__title">Upcoming</h2>
        {table(upcoming)}
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Past and cancelled</h2>
        {table(past.slice(0, 50))}
      </section>
    </>
  );
}
