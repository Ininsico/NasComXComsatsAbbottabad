import { Link } from 'react-router-dom';

export default function PageHero({ title, description, crumb }) {
  return (
    <section className="page-hero">
      <div className="container">
        <ul className="breadcrumb">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li aria-current="page">{crumb ?? title}</li>
        </ul>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </section>
  );
}
