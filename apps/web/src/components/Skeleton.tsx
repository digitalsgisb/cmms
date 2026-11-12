/** Reserve space while data loads; keep decorative placeholders out of the accessibility tree. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PageSkeleton({ label = "Loading page", compact = false }: { label?: string; compact?: boolean }) {
  return <section className={`page-skeleton ${compact ? "is-compact" : ""}`} role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="skeleton-heading"><Skeleton /><Skeleton /></div>
    {!compact ? <div className="skeleton-metrics">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} />)}</div> : null}
    <div className="skeleton-rows">{Array.from({ length: compact ? 3 : 6 }, (_, i) => <Skeleton key={i} />)}</div>
  </section>;
}
