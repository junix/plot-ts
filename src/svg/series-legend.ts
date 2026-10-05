/** Bounded, opt-in series keys. No font measurement or additional motion targets. */
import type { CanonicalTheme } from '../style/canonical.js';
import type { Html } from '../util/html.js';
import { h, join, n, text } from '../util/html.js';
import { estimateTextWidth } from '../util/scale.js';
import { seriesTone, svg } from './context.js';

export type SeriesLegendProfile = 'series-names-v1';

type LegendChart = 'column' | 'line';
interface LegendRow { name: string; advance: number; color: string; opacity: number }

/** Call only for an explicit option; the omitted path never inspects series names. */
export function renderWithSeriesLegend(
  chart: LegendChart,
  profile: unknown,
  series: ReadonlyArray<{ name?: string }>,
  width: number,
  height: number,
  theme: CanonicalTheme | undefined,
  renderBody: (plotHeight: number) => Html,
): Html {
  if (profile !== 'series-names-v1') {
    throw new RangeError(`SVG ${chart} legend must be 'series-names-v1' when provided`);
  }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError(`SVG ${chart} panel width and height must be finite positive numbers`);
  }
  if (!Array.isArray(series) || series.length < 1 || series.length > 8) {
    throw new RangeError(`SVG ${chart} series-names-v1 legend requires 1–8 series`);
  }

  const names = new Set<string>();
  const encodings = new Set<string>();
  const rows = Array.from(series, (s, index): LegendRow => {
    const field = `SVG ${chart} legend series[${index}].name`;
    const name = s?.name;
    validateSingleLineText(name, field);
    if (names.has(name)) throw new RangeError(`${field} must be exactly distinct from every other series name`);
    names.add(name);

    const advance = estimateTextWidth(name, 11);
    // Both the estimate and the emitted two-decimal advance must fit. Never
    // shorten names or use a hidden font-size/layout fallback at the boundary.
    if (!Number.isFinite(advance) || advance <= 0 || advance > width - 36 ||
        Number(n(advance)) <= 0 || Number(n(advance)) > width - 36) {
      throw new RangeError(`${field} does not fit the full-name legend row; increase the panel width or shorten the name`);
    }
    const { color, opacity } = seriesTone(index, undefined, theme);
    // Line paths use only the tone's color, even when columns use its opacity.
    const key = chart === 'column' ? `${color}\0${opacity}` : color;
    if (encodings.has(key)) {
      throw new RangeError(`SVG ${chart} legend series have identical visible encodings; choose a canonical theme or fewer series`);
    }
    encodings.add(key);
    return { name, advance, color, opacity };
  });

  const reserve = 16 + 18 * rows.length;
  const plotHeight = height - reserve;
  // At extreme finite magnitudes subtraction can lose the reserved band.
  // Keep ordinary fractional panels, but never emit a collapsed legend area.
  if (Math.abs((height - plotHeight) - reserve) > 1e-8) {
    throw new RangeError(`SVG ${chart} legend height reservation loses numeric precision; reduce the panel height`);
  }
  let body: Html;
  try {
    // Use the chart's real inset checks, domain, labels and motion at the
    // reduced height. This layer does not duplicate its geometry rules.
    body = renderBody(plotHeight);
  } catch (error) {
    if (error instanceof RangeError && (error.message.startsWith(`SVG ${chart} drawable width and height`) ||
        error.message.startsWith(`SVG ${chart} panel width and height`))) {
      throw new RangeError(`${error.message}; series-names-v1 reserves ${reserve} pixels for the legend, so increase the panel size or reduce the number of series`);
    }
    throw error;
  }

  const legend = h('g', {
    'data-plot-legend': 'series-names-v1',
    transform: `translate(0, ${plotHeight})`,
    // Preserve intentional leading, trailing and repeated spaces. SVG 1.1
    // normalizes tabs/newlines even with this attribute, so those reject below.
    'xml:space': 'preserve',
  }, ...rows.map((row, index) => {
    const y = 17 + 18 * index;
    const swatch = chart === 'column'
      ? h('rect', { x: 8, y: y - 5, width: 12, height: 10, fill: row.color, opacity: row.opacity === 1 ? undefined : row.opacity })
      : h('line', { x1: 8, x2: 20, y1: y, y2: y, stroke: row.color, 'stroke-width': 2 });
    return join(swatch, text(28, y, row.name, {
      size: 11, anchor: 'start', baseline: 'middle',
      fill: theme?.tokens['--ink'] ?? '#051C2C', textLength: row.advance,
    }));
  }));
  return svg(width, height, join(body, legend));
}

export function validateSingleLineText(name: unknown, field: string, kind = 'name'): asserts name is string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new RangeError(`${field} must be a nonblank string`);
  }
  let scalars = 0;
  let bytes = 0;
  for (const char of name) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d ||
        cp >= 0xd800 && cp <= 0xdfff || cp === 0xfffe || cp === 0xffff) {
      throw new RangeError(`${field} must contain valid Unicode scalar and XML 1.0 text`);
    }
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029) {
      throw new RangeError(`${field} must be a single-line ${kind} without tabs or line separators`);
    }
    scalars++;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (scalars > 128 || bytes > 512) {
      throw new RangeError(`${field} must contain at most 128 Unicode scalars and 512 UTF-8 bytes`);
    }
  }
}
