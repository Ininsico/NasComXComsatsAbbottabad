export function SkeletonText({ width }) {
  return <div className="skeleton skeleton--text" style={width ? { width } : undefined} />;
}

export function SkeletonTitle() {
  return <div className="skeleton skeleton--title" />;
}

export function SkeletonCard() {
  return <div className="skeleton skeleton--card" />;
}

export function SkeletonTile() {
  return <div className="skeleton skeleton--tile" />;
}

export function SkeletonRow() {
  return <div className="skeleton skeleton--row" />;
}

export function SkeletonGrid({ count = 3, variant = 'card' }) {
  const Item = variant === 'tile' ? SkeletonTile : SkeletonCard;

  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }, (unused, index) => (
        <Item key={index} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 3 }) {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: rows }, (unused, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}
