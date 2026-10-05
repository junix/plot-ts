/** Bounded, truthful native quantitative guides. Legacy renderers never call this plan. */
import type { ScaledAxes } from './scaled-axes.js';
import type { CanonicalTheme } from '../style/canonical.js';
import { INK, INK_ALPHA } from '../style/tokens.js';
import { h, join, n, text, type Html } from '../util/html.js';
import { estimateTextWidth, fmt } from '../util/scale.js';
import { plot, xOf, yOf, SVG_FONT_FAMILY, type Plot } from './context.js';
import { validateSingleLineText } from './series-legend.js';

export type NumericAxesProfile = 'numeric-axes-v1';
type Chart = 'column' | 'line' | 'scatter';
type Domain = readonly [number, number];
interface Options {
  xScale?: unknown; yScale?: unknown; xDomain?: unknown; yDomain?: unknown;
  axes?: unknown; unit?: unknown; xUnit?: unknown; yAxis?: unknown; xAxis?: unknown;
}

/** Explicit undefined is omission. Old ignored units remain ignored on that path. */
export function numericAxesEnabled(chart: Chart, options: Options): boolean {
  for (const field of ['xScale', 'yScale', 'xDomain', 'yDomain'] as const) {
    if (options[field] !== undefined) throw new RangeError(`SVG ${chart} ${field} requires axes: 'scaled-axes-v1' on line or scatter`);
  }
  if (options.axes === undefined) {
    if (options.xUnit !== undefined) throw new RangeError(`SVG ${chart} xUnit requires axes: 'numeric-axes-v1'`);
    return false;
  }
  if (options.axes !== 'numeric-axes-v1') throw new RangeError(`SVG ${chart} axes must be 'numeric-axes-v1' when provided`);
  if (options.yAxis !== undefined && options.yAxis !== true ||
      chart === 'scatter' && options.xAxis !== undefined && options.xAxis !== true) {
    throw new RangeError(`SVG ${chart} numeric-axes-v1 requires axis flags to be omitted or true`);
  }
  if (chart === 'column' && options.xUnit !== undefined) throw new RangeError('SVG column numeric-axes-v1 has no numeric X unit');
  for (const field of ['unit', 'xUnit'] as const) {
    if (options[field] !== undefined) validateSingleLineText(options[field], `SVG ${chart} numeric-axes-v1 ${field}`, 'text');
  }
  return true;
}

/** Exact-value formatting: only use the old formatter when its text round-trips. */
export function numericAxisLabel(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('SVG numeric-axes-v1 ticks must be finite');
  if (Object.is(value, -0)) value = 0;
  let plain: string | undefined;
  for (let precision = 0; precision <= 12; precision++) {
    const candidate = fmt(value, 'plain', precision);
    if (Number(candidate.replaceAll(',', '')) === value && /^[\d,.eE+\-]+$/.test(candidate)) {
      if (plain === undefined || candidate.length < plain.length) plain = candidate;
    }
  }
  if (plain !== undefined && plain.length <= 12) return plain;
  const candidates = [plain, String(value), value.toExponential()].filter((v): v is string => v !== undefined);
  const label = candidates.reduce((best, v) => v.length < best.length ? v : best);
  if (label.length > 32 || Number(label.replaceAll(',', '')) !== value) throw new RangeError('SVG numeric-axes-v1 tick cannot be represented exactly');
  return label;
}

/** At most six values, including exact endpoints and the required signed zero. */
export function numericAxisValues([min, max]: Domain, intervals: 4 | 2 | 1): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(max - min) || min > max) {
    throw new RangeError('SVG numeric-axes-v1 domain endpoints and span must be finite and ordered');
  }
  if (min === max) return [min === 0 ? 0 : min];
  const values = [min, max];
  for (let i = 1; i < intervals; i++) {
    let value = min + (max - min) * (i / intervals);
    const clean = Number(value.toPrecision(12));
    if (Number.isFinite(clean) && clean > min && clean < max && Math.sign(clean) === Math.sign(value)) value = clean;
    if (value > min && value < max) values.push(value);
  }
  if (min < 0 && max > 0) values.push(0);
  return [...new Set(values.map(v => v === 0 ? 0 : v))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

/** Decimal comparison avoids epsilon, false clipping and lost reserves at huge sizes. */
function nonnegative(terms: number[]): boolean {
  if (!terms.every(Number.isFinite)) return false;
  const decimals = terms.map(value => {
    const [mantissa, power = '0'] = String(value).split('e');
    const [whole, fraction = ''] = mantissa!.split('.');
    return { coefficient: BigInt(whole! + fraction), exponent: Number(power) - fraction.length };
  });
  const exponent = Math.min(...decimals.map(d => d.exponent));
  return decimals.reduce((sum, d) => sum + d.coefficient * 10n ** BigInt(d.exponent - exponent), 0n) >= 0n;
}
interface Tick { value: number; label: string; position: number; advance: number; anchor: 'start' | 'middle' | 'end' }
interface Box { x: number; y: number; left: number; right: number; top: number; bottom: number }
interface Axis { domain: Domain; ticks: Tick[] }
export interface NumericAxesPlan { plot: Plot; grid: Html; guides: Html; motionBottom: number }
interface PlanInput {
  chart: Chart; width: number; height: number; y: Domain; x?: Domain;
  unit?: string | undefined; xUnit?: string | undefined; inset: Plot['inset']; theme?: CanonicalTheme | undefined;
  recenter?: (p: Plot) => Plot; radius?: number; scaled?: ScaledAxes;
}

function boxFits(b: Box, width: number, height: number): boolean {
  return nonnegative([b.x, -b.left, -8]) && nonnegative([width, -8, -b.x, -b.right]) &&
    nonnegative([b.y, -b.top, -8]) && nonnegative([height, -8, -b.y, -b.bottom]);
}
function separate(a: Box, b: Box): boolean {
  return nonnegative([b.x, -b.left, -a.x, -a.right, -6]) || nonnegative([a.x, -a.left, -b.x, -b.right, -6]) ||
    nonnegative([b.y, -b.top, -a.y, -a.bottom, -6]) || nonnegative([a.y, -a.top, -b.y, -b.bottom, -6]);
}

/** Y density has priority, then X; exactly three by three candidates at most. */
export function planNumericAxes(input: PlanInput): NumericAxesPlan {
  const { chart, width, height, y, x, unit, xUnit, inset, theme } = input;
  const profile = input.scaled ? 'scaled-axes-v1' : 'numeric-axes-v1';
  const fail = () => new RangeError(`SVG ${chart} ${profile} full ticks and units do not fit; increase the panel size, reduce grid columns or legend rows, or supply shorter unit wording`);
  const units = [unit, xUnit].map(value => value === undefined ? 0 : estimateTextWidth(value, 11));
  if (units.some(advance => !nonnegative([width, -16, -advance]) || !nonnegative([width, -16, -Number(n(advance))]))) throw fail();
  const halo = input.radius === undefined ? 0 : input.radius + 2.01;
  const bottomHalo = input.radius === undefined ? 0 : halo + 8;
  // Keep the bottom unit's 8px box inside fractional viewports even when its
  // baseline rounds upward; reserve the matching independent gap above it.
  const xUnitY = height - 16.01;
  for (const yCount of [4, 2, 1] as const) {
    const yValues = input.scaled ? input.scaled.y.ticks(yCount) : numericAxisValues(y, yCount);
    const yLabels = yValues.map(numericAxisLabel);
    const widest = Math.max(...yLabels.map(v => estimateTextWidth(v, 10)));
    for (const xCount of (x ? [4, 2, 1] : [1]) as Array<4 | 2 | 1>) {
      const required = {
        top: Math.max(inset.top, 15, halo + 8) + (unit === undefined ? 0 : 22),
        right: Math.max(inset.right, halo + 8),
        bottom: Math.max(inset.bottom, x ? bottomHalo + 32 + (xUnit === undefined ? 0 : 22.02) : 15),
        left: Math.max(inset.left, 8 + widest + 10 + halo),
      };
      // One hundredth of safety prevents independent two-decimal serialization
      // from consuming a required gap. This is padding, never a fit tolerance.
      const reserve = (value: number) => Math.ceil(value * 100) / 100 + 0.01;
      let p = plot(width, height, { top: reserve(required.top), right: reserve(required.right), bottom: reserve(required.bottom), left: reserve(required.left) });
      if (input.recenter) p = input.recenter(p);
      if (!Number.isFinite(p.w) || !Number.isFinite(p.h) || p.w < 64 || p.h < 48) continue;
      const makeAxis = (domain: Domain, values: number[], horizontal: boolean): Axis => ({ domain, ticks: values.map((value, i) => {
        const label = numericAxisLabel(value);
        return { value, label, position: input.scaled ? horizontal ? p.x0 + input.scaled.x.fraction(value) * p.w : p.y0 + p.h - input.scaled.y.fraction(value) * p.h : horizontal ? xOf(p, value, ...domain) : yOf(p, value, ...domain), advance: estimateTextWidth(label, 10),
          anchor: horizontal ? values.length === 1 ? 'middle' : i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle' : 'end' };
      }) });
      const yAxis = makeAxis(y, yValues, false);
      const xAxis = x ? makeAxis(x, input.scaled ? input.scaled.x.ticks(xCount) : numericAxisValues(x, xCount), true) : undefined;
      const yRule = p.x0 - halo;
      const yText = yRule - 10;
      const xRule = p.y0 + p.h + bottomHalo;
      const xText = xRule + 17;
      const fits = (serialized: boolean): boolean => {
        const q = (v: number) => serialized ? Number(n(v)) : v;
        // Check actual emitted plot edges against every reserved band. At huge
        // magnitudes an apparently positive inset may have vanished entirely.
        if (!nonnegative([q(p.x0), -required.left]) || !nonnegative([width, -q(p.x0 + p.w), -required.right]) ||
            !nonnegative([q(p.y0), -required.top]) || !nonnegative([height, -q(p.y0 + p.h), -required.bottom]) ||
            !nonnegative([q(p.x0 + p.w), -q(p.x0), -64]) || !nonnegative([q(p.y0 + p.h), -q(p.y0), -48])) return false;
        const boxes: Box[] = yAxis.ticks.map(t => ({ x: q(yText), y: q(t.position), left: q(t.advance), right: 0, top: 7, bottom: 7 }));
        for (const t of xAxis?.ticks ?? []) {
          const advance = q(t.advance);
          boxes.push({ x: q(t.position), y: q(xText), left: t.anchor === 'start' ? 0 : t.anchor === 'end' ? advance : advance / 2,
            right: t.anchor === 'end' ? 0 : t.anchor === 'start' ? advance : advance / 2, top: 7, bottom: 7 });
        }
        if (unit !== undefined) boxes.push({ x: 8, y: 16, left: 0, right: q(units[0]!), top: 8, bottom: 8 });
        if (xUnit !== undefined) boxes.push({ x: q(width / 2), y: q(xUnitY), left: q(units[1]!) / 2, right: q(units[1]!) / 2, top: 8, bottom: 8 });
        if (!boxes.every(b => boxFits(b, width, height))) return false;
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (!separate(boxes[i]!, boxes[j]!)) return false;
        for (const axis of [xAxis, yAxis]) {
          if (!axis) continue;
          if (new Set(axis.ticks.map(t => q(t.position))).size !== axis.ticks.length) return false;
        }
        return true;
      };
      if (!fits(false) || !fits(true)) continue;
      const structure = { stroke: theme?.tokens['--line'] ?? INK, 'stroke-opacity': theme ? 1 : INK_ALPHA.rule, 'stroke-width': 1 };
      const grids = yAxis.ticks.filter(t => t.value === 0 && chart !== 'scatter' || t.value > y[0] && t.value < y[1]).map(t => h('line', {
        'data-plot-grid-value': String(t.value), x1: n(p.x0), x2: n(p.x0 + p.w), y1: n(t.position), y2: n(t.position),
        ...(t.value === 0 ? structure : { stroke: theme?.tokens['--grid'] ?? INK, 'stroke-opacity': theme ? 1 : INK_ALPHA.grid, 'stroke-width': 1 }),
      }));
      const axisGroup = (axis: Axis, horizontal: boolean) => h('g', { 'data-plot-axis': horizontal ? 'x' : 'y', 'data-domain-min': String(axis.domain[0]), 'data-domain-max': String(axis.domain[1]), ...(input.scaled ? { 'data-plot-scale': horizontal ? input.scaled.x.kind : input.scaled.y.kind } : {}) },
        ...axis.ticks.map(t => h('g', { 'data-plot-tick-value': String(t.value) },
          h('line', { x1: n(horizontal ? t.position : yRule), x2: n(horizontal ? t.position : yRule - 4),
            y1: n(horizontal ? xRule : t.position), y2: n(horizontal ? xRule + 4 : t.position), ...structure }),
          text(horizontal ? t.position : yText, horizontal ? xText : t.position, t.label, { size: 10, baseline: 'middle', anchor: t.anchor, fill: theme?.tokens['--ink'] ?? INK, textLength: t.advance }),
        )));
      const guides = h('g', { 'data-plot-axes': profile, 'xml:space': 'preserve', style: `font-family: ${SVG_FONT_FAMILY};` },
        axisGroup(yAxis, false), xAxis ? axisGroup(xAxis, true) : '',
        unit === undefined ? '' : h('g', { 'data-plot-unit': 'y' }, text(8, 16, unit, { size: 11, baseline: 'middle', anchor: 'start', fill: theme?.tokens['--ink'] ?? INK, textLength: units[0]! })),
        xUnit === undefined ? '' : h('g', { 'data-plot-unit': 'x' }, text(width / 2, xUnitY, xUnit, { size: 11, baseline: 'middle', anchor: 'middle', fill: theme?.tokens['--ink'] ?? INK, textLength: units[1]! })),
      );
      return { plot: p, grid: join(...grids), guides, motionBottom: Number(n(xRule - 2)) };
    }
  }
  throw fail();
}

/** Opt-in domains never extrapolate, even if the old native path permits it. */
export function assertNumericAxisContains(chart: Chart, min: number, max: number, dataMin: number, dataMax: number, explicitMax?: number): void {
  if (explicitMax !== undefined && (!Number.isFinite(explicitMax) || explicitMax < dataMax || explicitMax < 0) ||
      min > dataMin || max < dataMax || min > max || dataMin !== dataMax && min === max) {
    throw new RangeError(`SVG ${chart} numeric-axes-v1 resolved domain and explicit max must contain every rendered value and stack endpoint`);
  }
}
