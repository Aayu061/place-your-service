/**
 * Place Your Service (PYS) — Catmull-Rom to Cubic Bezier Spline Algorithm
 * Generates continuous C1-smooth curves through operational data points
 * without Runge's phenomenon or sharp polyline creases.
 */

export interface SplinePoint {
  x: number;
  y: number;
}

/**
 * Converts a sequence of 2D points into an SVG path string ('M ... C ...')
 * using Catmull-Rom tangent vectors converted to Cubic Bezier control points.
 *
 * @param points Array of 2D coordinates
 * @param tension Curve tension factor (default: 1.0, lower is looser, higher is tighter)
 */
export function generateSmoothBezierSpline(points: SplinePoint[], tension: number = 1.0): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)},${points[1].y.toFixed(2)}`;
  }

  let path = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-Rom to Cubic Bezier control point derivation:
    // C1 = P1 + (P2 - P0) / (6 * tension)
    // C2 = P2 - (P3 - P1) / (6 * tension)
    const c1x = p1.x + (p2.x - p0.x) / (6 * tension);
    const c1y = p1.y + (p2.y - p0.y) / (6 * tension);
    const c2x = p2.x - (p3.x - p1.x) / (6 * tension);
    const c2y = p2.y - (p3.y - p1.y) / (6 * tension);

    path += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  return path;
}

/**
 * Generates a closed area SVG path below the spline curve for gradient fill.
 *
 * @param points Array of 2D coordinates
 * @param baselineY Bottom Y coordinate of the chart coordinate system
 * @param tension Curve tension factor
 */
export function generateSplineArea(points: SplinePoint[], baselineY: number, tension: number = 1.0): string {
  if (!points || points.length < 2) return '';
  const curve = generateSmoothBezierSpline(points, tension);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  return `${curve} L ${lastPoint.x.toFixed(2)},${baselineY.toFixed(2)} L ${firstPoint.x.toFixed(2)},${baselineY.toFixed(2)} Z`;
}
