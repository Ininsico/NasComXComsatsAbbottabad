let dateFormatter;
let dateTimeFormatter;
let currencyFormatter;

export function formatDate(value) {
  if (!value) return '—';
  dateFormatter ??= new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return '—';
  dateTimeFormatter ??= new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return dateTimeFormatter.format(new Date(value));
}

export function formatCurrency(value) {
  currencyFormatter ??= new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  });
  return currencyFormatter.format(Number(value ?? 0));
}

export function formatBytes(bytes) {
  const value = Number(bytes ?? 0);

  if (value <= 0) return '0 KB';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round((value / 1024) * 10) / 10} KB`;

  return `${Math.round((value / 1024 / 1024) * 10) / 10} MB`;
}

export function percent(value) {
  return `${Number(value ?? 0)}%`;
}
