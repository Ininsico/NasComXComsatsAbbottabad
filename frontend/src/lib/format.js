let dateFormatter;
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

export function formatCurrency(value) {
  currencyFormatter ??= new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  });
  return currencyFormatter.format(Number(value ?? 0));
}

export function percent(value) {
  return `${Number(value ?? 0)}%`;
}
