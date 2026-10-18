import { Link } from 'react-router-dom';
import { BRAND } from '../data/site.js';

export default function Logo({ tagline = 'CRM', to = '/' }) {
  return (
    <Link className="brand" to={to} aria-label={`${BRAND.product} — home`}>
      <img className="brand__mark" src="/logo.png" alt="" height="34" />
      <span className="brand__text">
        <span className="brand__name">{BRAND.name}</span>
        {tagline ? <span className="brand__tag">{tagline}</span> : null}
      </span>
    </Link>
  );
}
