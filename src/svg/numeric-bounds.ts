/** Decimal ladders are private to the opt-in numeric-axis profile. Legacy scale
 * helpers deliberately retain their historical arithmetic and output bytes. */
const FINE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;
const AXIS_STEPS = [1, 1.2, 2, 2.4, 3.2, 4, 5, 6, 8, 10] as const;

/** First representable decimal-ladder candidate containing a positive value.
 * Parse each complete decimal candidate once, rather than multiplying by an
 * approximate power. No tolerance may move a bound inside the actual data.
 * At subnormal magnitudes candidates can repeat or round to zero; skip those.
 * If the next required candidate overflows, reject instead of clipping it. */
function decimalNiceCeil(value: number, steps: readonly number[]): number {
  if (!Number.isFinite(value)) throw new RangeError('SVG numeric-axes-v1 inferred maximum must be finite');
  if (value <= 0) return 0;
  const exponent = Number(value.toExponential().split('e')[1]);
  for (const step of steps) {
    const candidate = Number(`${step}e${exponent}`);
    if (Number.isFinite(candidate) && candidate >= value) return candidate;
  }
  throw new RangeError('SVG numeric-axes-v1 inferred maximum requires a finite outward decimal bound');
}

export function numericNiceCeil(value: number): number {
  return decimalNiceCeil(value, FINE_STEPS);
}

export function numericNiceCeilForAxis(value: number): number {
  return decimalNiceCeil(value, AXIS_STEPS);
}
