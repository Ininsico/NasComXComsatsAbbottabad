/**
 * The acknowledgement clock, in one place.
 *
 * The server owns the deadline; this only formats it. Kept out of the page component
 * because a file that exports both a component and a helper breaks fast refresh.
 */
export function countdown(lead, now) {
  if (lead.acknowledgedAt) return { label: 'Acknowledged', tone: 'done' };
  if (!lead.ackDeadline) return { label: 'No clock', tone: 'idle' };

  const deadline = Date.parse(lead.ackDeadline);

  if (!Number.isFinite(deadline)) return { label: 'No clock', tone: 'idle' };

  const seconds = Math.round((deadline - now) / 1000);

  if (seconds >= 0) {
    const minutes = Math.floor(seconds / 60);

    return {
      label: `${minutes}:${String(seconds % 60).padStart(2, '0')} left`,
      tone: seconds <= 10 ? 'warn' : 'pending',
    };
  }

  return { label: `${Math.abs(seconds)}s overdue`, tone: 'problem' };
}
