import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="font-display text-7xl font-black text-neon-pink">404</p>
      <h1 className="mt-2 font-display text-xl font-bold">Level not found</h1>
      <p className="mt-2 text-sm text-ink-200">That page doesn’t exist. Let’s get you back to the arcade.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to games
      </Link>
    </div>
  );
}
