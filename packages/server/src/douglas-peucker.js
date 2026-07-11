// ============================================================
// Douglas-Peucker path simplification.
// Pure geometry — no DB, no side effects. Given an array of
// { x, y, ...extra } points, return a subset that preserves shape
// within ε (tile units by convention).
// ============================================================

/**
 * Perpendicular distance from point p to the line through a→b.
 * Degenerate (a === b) short-circuits to the euclidean distance.
 */
function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Distance from p to the infinite line through a and b:
  //   |((b - a) × (a - p))| / |b - a|
  const num = Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy);
  const den = Math.hypot(dx, dy);
  return num / den;
}

/**
 * Iterative Douglas-Peucker. Stack-based to avoid recursion blow-ups
 * on long trajectories.
 *
 * @param {Array<{x:number,y:number}>} points
 * @param {number} epsilon  tolerance in the same units as x/y (tiles)
 * @returns {Array<{x:number,y:number}>}
 */
export function simplify(points, epsilon) {
  if (!Array.isArray(points) || points.length < 3) return points || [];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let maxIndex = -1;
    const a = points[start];
    const b = points[end];
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], a, b);
      if (d > maxDist) { maxDist = d; maxIndex = i; }
    }
    if (maxDist > epsilon && maxIndex !== -1) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}
