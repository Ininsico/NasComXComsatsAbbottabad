import { SkeletonGrid, SkeletonList, SkeletonTitle } from './Skeletons.jsx';
import ErrorCard from './ErrorCard.jsx';

const SHAPES = {
  cards: (count) => <SkeletonGrid count={count} variant="card" />,
  tiles: (count) => <SkeletonGrid count={count} variant="tile" />,
  rows: (count) => <SkeletonList rows={count} />,
};

export default function AsyncSection({
  loading,
  error,
  onRetry,
  shape = 'cards',
  count = 3,
  label = 'Loading content',
  errorTitle,
  children,
}) {
  if (loading) {
    const render = SHAPES[shape];

    return (
      <div aria-busy="true">
        <span className="sr-only">{label}</span>
        <div className="skeleton-stack" style={{ marginBottom: '1.25rem' }}>
          <SkeletonTitle />
        </div>
        {render ? render(count) : null}
      </div>
    );
  }

  if (error) {
    return <ErrorCard title={errorTitle} error={error} onRetry={onRetry} />;
  }

  return children;
}
