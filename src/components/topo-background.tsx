/**
 * Decorative topographic contour lines (deterministic, server-rendered SVG).
 * Concentric wobbly rings around a "you are here" point — the radius idea, drawn as a map.
 */
function ringPath(cx: number, cy: number, r: number, seed: number): string {
  const pts: string[] = [];
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble =
      1 + 0.07 * Math.sin(3 * a + seed) + 0.045 * Math.sin(5 * a + seed * 1.7) + 0.03 * Math.cos(7 * a + seed * 0.6);
    const x = cx + Math.cos(a) * r * wobble * 1.15;
    const y = cy + Math.sin(a) * r * wobble * 0.9;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${pts.join(" ")} Z`;
}

export function TopoBackground({ className }: { className?: string }) {
  const rings = Array.from({ length: 14 }, (_, i) => 40 + i * 46);
  return (
    <svg className={className} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#c9d6c2" strokeWidth="1.2">
        {rings.map((r, i) => (
          <path key={r} d={ringPath(260, 330, r, i * 0.9)} strokeWidth={i % 5 === 4 ? 2 : 1.1} />
        ))}
      </g>
      <g fill="none" stroke="#c9d6c2" strokeWidth="1">
        {[30, 70, 110, 150].map((r, i) => (
          <path key={r} d={ringPath(1040, 120, r, 4 + i)} />
        ))}
      </g>
    </svg>
  );
}
