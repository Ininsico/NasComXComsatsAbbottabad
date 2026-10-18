import { db } from './db.js';

/**
 * Appointments: the CRM's own record of a booking, alongside the Google event. The Google
 * event is the calendar's truth; this row is what the product lists, links to a lead and
 * can cancel — so the page works even when the calendar provider is having a bad day.
 */
const appointments = db.collection('appointments');

const text = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

export async function recordAppointment({
  workspaceId,
  leadId = null,
  contactId = null,
  memberId = null,
  memberName = '',
  title,
  start,
  end,
  timeZone,
  googleEventId = null,
}) {
  return appointments.insert({
    workspaceId,
    leadId,
    contactId,
    memberId,
    memberName: text(memberName, 120),
    title: text(title, 200) || 'Appointment',
    start,
    end,
    timeZone: text(timeZone, 60),
    googleEventId,
    status: 'booked',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  });
}

export async function listAppointments(workspaceId, { limit = 100 } = {}) {
  return (await appointments.where((row) => row.workspaceId === workspaceId))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, Math.min(Number(limit) || 100, 500));
}

export async function findAppointment(id, workspaceId) {
  return appointments.find((row) => row.id === id && row.workspaceId === workspaceId);
}

export async function markCancelled({ workspaceId, id }) {
  return appointments.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return null;
    if (row.status === 'cancelled') return row;

    row.status = 'cancelled';
    row.cancelledAt = new Date().toISOString();

    return row;
  });
}

/** Upcoming only, soonest first — the dashboard tile and the page header both want this. */
export function upcoming(appointments, { now = Date.now(), limit = 5 } = {}) {
  return appointments
    .filter((row) => row.status === 'booked' && Date.parse(row.start) >= now)
    .slice(0, limit);
}
