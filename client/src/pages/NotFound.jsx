import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page page--narrow center-page" style={{ minHeight: '60vh' }}>
      <div style={{ fontSize: '3.5rem', lineHeight: 1 }} aria-hidden="true">
        🍽
      </div>
      <h1 className="mt-16">We could not find that page</h1>
      <p className="muted mt-8">
        The link may be old, or the order may have been removed.
      </p>

      <div className="row gap-8 mt-24 wrap" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn btn--primary">
          Back to home
        </Link>
        <Link to="/menu" className="btn btn--secondary">
          Browse the menu
        </Link>
        <Link to="/track" className="btn btn--ghost">
          Track an order
        </Link>
      </div>
    </div>
  );
}
