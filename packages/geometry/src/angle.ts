const TWO_PI = Math.PI * 2;

export function normalizeAngle(angle: number): number {
  const normalized = ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return normalized === -Math.PI ? Math.PI : normalized;
}

export function angleDifference(from: number, to: number): number {
  return normalizeAngle(to - from);
}

export function interpolateAngle(from: number, to: number, amount: number): number {
  return normalizeAngle(from + angleDifference(from, to) * amount);
}
