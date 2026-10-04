import { niceCeil } from '../util/scale.js';

/** Preserve the existing scale arithmetic, but never emit an unrepresentable domain. */
export function assertFiniteDomain(chart: string, axis: string, min: number, max: number): void {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(max - min)) {
    throw new RangeError(`SVG ${chart} ${axis} domain endpoints and span must be finite`);
  }
}

/** A positive inferred bound must not overflow to infinity or underflow to zero. */
export function niceUpperBound(chart: string, value: number, nice = niceCeil): number {
  const result = nice(value);
  if (!Number.isFinite(result) || (value > 0 && result <= 0)) {
    throw new RangeError(`SVG ${chart} inferred maximum must be finite and positive for positive data`);
  }
  return result;
}

/** Check each partial accumulation, even if a later signed step would cancel it. */
export function assertFiniteTotal(chart: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`SVG ${chart} accumulated totals must be finite`);
  }
}
