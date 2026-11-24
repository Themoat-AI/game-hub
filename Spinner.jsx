export function Spinner({ size = 20, className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-ink-600 border-t-neon-cyan ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex flex-col items-center gap-4 text-ink-400">
        <Spinner size={36} />
        <p className="font-display text-xs uppercase tracking-[0.3em]">{label}</p>
      </div>
    </div>
  );
}
