/** Logo: a trail marker (yellow bar) over contour rings. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#1f3d2e" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#a9c4b0" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="#a9c4b0" strokeWidth="1.4" />
      <rect x="9" y="14" width="14" height="4" rx="1" fill="#f2c230" />
    </svg>
  );
}
