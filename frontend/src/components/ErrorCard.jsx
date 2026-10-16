import { CircleAlert, RefreshCw } from 'lucide-react';

export default function ErrorCard({
  title = 'We could not load this',
  error,
  onRetry,
  retryLabel = 'Try again',
}) {
  return (
    <div className="error-card" role="alert">
      <span className="error-card__icon" aria-hidden="true">
        <CircleAlert size={22} />
      </span>
      <h3>{title}</h3>
      <p>{error?.message ?? 'Something went wrong on our side. Please try again.'}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
