/** Native-only exact-extent linear/log10 scales; no provider contract is implied. */
import type { LineChart, ScatterChart } from './charts.js';
import { numericAxisValues } from './numeric-axes.js';
import { validateSingleLineText } from './series-legend.js';

export type ScaledAxesProfile = 'scaled-axes-v1';
export type NativeAxisScale = 'linear' | 'log10';
export type NativeAxisDomain = readonly [number, number];
export interface ScaledAxesOptions {
  xScale?: NativeAxisScale;
  yScale?: NativeAxisScale;
  xDomain?: NativeAxisDomain;
  yDomain?: NativeAxisDomain;
}
export interface ScaledAxis {
  kind: NativeAxisScale;
  domain: NativeAxisDomain;
  fraction(value: number): number;
  ticks(intervals: 4 | 2 | 1): number[];
}
export interface ScaledAxes { x: ScaledAxis; y: ScaledAxis }

const profile = 'scaled-axes-v1';
const fail = (message: string): never => { throw new RangeError(`SVG ${profile} ${message}`); };
// Fixed-point arithmetic avoids libm drift and binary64 branch discontinuities.
// With |z| <= 1/3, 96 atanh terms leave < 1e-94 analytic remainder.
// Conservative fixed-point error, including exponent*ln(2), is < 2^-230.
// See docs/svg-scaled-axes.md for the rounding and monotonicity argument.
const BITS = 256n, Q = 1n << BITS, Q_NUMBER = Number(Q);
const words = new DataView(new ArrayBuffer(8));
/** Exact 53-bit integer significand, including subnormal normalization. */
function binaryParts(value: number): [bigint, number] {
  let adjustment = 0;
  if (value < 2.2250738585072014e-308) { value *= 4503599627370496; adjustment = -52; }
  words.setFloat64(0, value, false);
  const high = words.getUint32(0, false), low = words.getUint32(4, false);
  const exponent = (high >>> 20) - 1023 + adjustment;
  const mantissa = BigInt((high & 0xfffff) * 4294967296 + low) + 4503599627370496n;
  return [mantissa, exponent];
}
/** Q * 2*atanh(numerator/denominator), with fixed bounded work and no floats. */
function fixedLog(numerator: bigint, denominator: bigint): bigint {
  const z = numerator * Q / denominator, square = z * z / Q;
  let term = z, sum = z;
  for (let i = 1n; i < 96n; i++) { term = term * square / Q; sum += term / (2n * i + 1n); }
  return 2n * sum;
}
const LOG_TWO = fixedLog(1n, 3n);
/** ln(a/b) for finite positive a >= b; exact ratio reduction before one rounding. */
export function positiveLogRatio(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0 || a < b) return fail('log ratio requires finite positive ordered values');
  if (a === b) return 0;
  const [am, ae] = binaryParts(a), [bm, be] = binaryParts(b);
  const fixed = BigInt(ae - be) * LOG_TWO + fixedLog(am - bm, am + bm);
  return Number(fixed) / Q_NUMBER;
}

function scale(value: unknown, axis: string): NativeAxisScale {
  if (value === undefined) return 'linear';
  if (value !== 'linear' && value !== 'log10') return fail(`${axis}Scale must be 'linear' or 'log10'`);
  return value;
}
function observation(value: unknown, kind: NativeAxisScale, location: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || kind === 'log10' && value <= 0) {
    fail(`${location} must be ${kind === 'log10' ? 'finite and strictly positive for log10' : 'finite'}`);
  }
}
function extent(values: readonly number[], kind: NativeAxisScale, requested: unknown, axis: string): NativeAxisDomain {
  let min = Infinity, max = -Infinity;
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  const empty = min === Infinity;
  if (requested !== undefined) {
    if (!Array.isArray(requested) || requested.length !== 2) return fail(`${axis}Domain must be an exact [min, max] pair`);
    observation(requested[0], kind, `${axis}Domain minimum`); observation(requested[1], kind, `${axis}Domain maximum`);
    if (requested[0] > requested[1] || !empty && (requested[0] > min || requested[1] < max)) return fail(`${axis}Domain must be ordered and contain every observation`);
    min = requested[0]; max = requested[1];
  } else if (empty) { min = kind === 'log10' ? 1 : 0; max = kind === 'log10' ? 10 : 1; }
  if (kind === 'linear' && !Number.isFinite(max - min)) return fail(`${axis}Domain linear span must be finite`);
  return [min === 0 ? 0 : min, max === 0 ? 0 : max];
}

/** Endpoints are mandatory. At most three interior, exact decimal decade values. */
export function logAxisValues([min, max]: NativeAxisDomain, intervals: 4 | 2 | 1): number[] {
  if (!(min > 0) || !Number.isFinite(max) || min > max) return fail('log domain must be finite positive and ordered');
  if (min === max) return [min];
  const decades: number[] = [];
  if (intervals > 1) {
    const first = Number(min.toExponential().split('e')[1]);
    const last = Number(max.toExponential().split('e')[1]);
    for (let exponent = first; exponent <= last; exponent++) {
      const value = Number(`1e${exponent}`);
      if (value > min && value < max && decades.at(-1) !== value) decades.push(value);
    }
  }
  const budget = intervals - 1;
  const interior = decades.length <= budget ? decades : Array.from({ length: budget }, (_, i) => decades[Math.floor((i + 1) * (decades.length + 1) / (budget + 1)) - 1]!);
  return [min, ...interior, max];
}
export function makeScaledAxis(kind: NativeAxisScale, domain: NativeAxisDomain): ScaledAxis {
  const [min, max] = domain;
  observation(min, kind, 'domain minimum'); observation(max, kind, 'domain maximum');
  if (min > max) return fail('domain must be ordered');
  const span = kind === 'log10' ? positiveLogRatio(max, min) : max - min;
  if (!Number.isFinite(span) || min !== max && span <= 0) return fail('transformed domain span must be finite and positive');
  return { kind, domain, fraction(value: number) {
    observation(value, kind, 'mapped observation');
    if (value < min || value > max) return fail('domain must contain every mapped observation');
    if (min === max) return 0.5;
    if (value === min) return 0;
    if (value === max) return 1;
    const result = (kind === 'log10' ? positiveLogRatio(value, min) : value - min) / span;
    if (!Number.isFinite(result) || result < 0 || result > 1) return fail('mapped fraction must be finite and contained');
    return result;
  }, ticks: intervals => kind === 'log10' ? logAxisValues(domain, intervals) : numericAxisValues(domain, intervals) };
}

/** Validate all supplied data, including null-paired X. Only null Y is a gap. */
export function resolveScaledAxes(chart: LineChart | ScatterChart): ScaledAxes {
  // Per-panel limits apply only to this new profile and precede all log work.
  if (chart.type === 'line') {
    if (chart.x.length > 65536 || chart.series.length > 256) return fail('line is limited to 65536 X entries and 256 series per panel');
    let positions = 0;
    for (const series of chart.series) {
      positions += series.y.length;
      if (positions > 65536) return fail('line is limited to 65536 supplied series positions per panel, including nulls');
    }
  } else if (chart.points.length > 65536) return fail('scatter is limited to 65536 supplied positions per panel');
  const xKind = scale(chart.xScale, 'x'), yKind = scale(chart.yScale, 'y');
  if (chart.yAxis !== undefined && chart.yAxis !== true || 'xAxis' in chart && chart.xAxis !== undefined && chart.xAxis !== true) return fail('axis flags must be omitted or true');
  for (const field of ['unit', 'xUnit'] as const) if (chart[field] !== undefined) validateSingleLineText(chart[field], `SVG ${profile} ${field}`, 'text');
  const x: number[] = [], y: number[] = [];
  if (chart.type === 'line') {
    if (chart.max !== undefined) return fail('max is unsupported; use yDomain');
    if (chart.labels !== undefined && chart.labels !== false) return fail('line point labels are unsupported');
    for (let i = 0; i < chart.x.length; i++) { const value = chart.x[i]; observation(value, xKind, `line x[${i}]`); x.push(value); }
    for (let s = 0; s < chart.series.length; s++) {
      const series = chart.series[s]!;
      for (const option of ['area', 'smooth'] as const) if (series[option] !== undefined && series[option] !== false) return fail(`line ${option} is unsupported; use straight unfilled lines`);
      if (series.y.length !== chart.x.length) return fail(`line series[${s}].y must have the same length as x`);
      for (let i = 0; i < series.y.length; i++) {
        const value = series.y[i]; if (value === null) continue;
        observation(value, yKind, `line series[${s}].y[${i}]`); y.push(value);
      }
    }
  } else {
    for (let i = 0; i < chart.points.length; i++) {
      const point = chart.points[i]!;
      observation(point.x, xKind, `scatter points[${i}].x`); observation(point.y, yKind, `scatter points[${i}].y`);
      if (point.size !== undefined && (typeof point.size !== 'number' || !Number.isFinite(point.size) || point.size < 0)) return fail(`scatter points[${i}].size must be a finite non-negative radius`);
      x.push(point.x); y.push(point.y);
    }
  }
  return { x: makeScaledAxis(xKind, extent(x, xKind, chart.xDomain, 'x')), y: makeScaledAxis(yKind, extent(y, yKind, chart.yDomain, 'y')) };
}

/** Unsupported chart families must not silently ignore the new native options. */
export function rejectScaledOptions(chart: string, options: object): void {
  const value = options as Record<string, unknown>;
  if (value.axes === profile || ['xScale', 'yScale', 'xDomain', 'yDomain'].some(field => value[field] !== undefined)) {
    fail(`${chart} is unsupported; scaled axes require line or scatter`);
  }
}
