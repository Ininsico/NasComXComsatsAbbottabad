import { Link } from 'react-router-dom';

export default function Logo({ tagline = 'Campus Management', to = '/' }) {
  return (
    <Link className="brand" to={to} aria-label="COMSATS Abbottabad — home">
      <img className="brand__mark" src="/logo.png" alt="" height="34" />
      <span className="brand__text">
        <span className="brand__name">COMSATS Abbottabad</span>
        {tagline ? <span className="brand__tag">{tagline}</span> : null}
      </span>
    </Link>
  );
}
