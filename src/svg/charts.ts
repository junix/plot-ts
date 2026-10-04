/**
 * SVG 图表渲染器 —— 纯函数，输入配置，输出 SVG 字符串。
 * 零浏览器依赖，可在 Node.js 直接运行。
 *
 * 设计原则：
 * 1. 所有输入都是纯数据（不依赖 DOM）
 * 2. 输出是 SVG 字符串，可直接写入文件或嵌入 HTML
 * 3. 动画通过 CSS class 标记，在浏览器端自动播放
 */

import { canonicalMarkText, type CanonicalTheme } from '../style/canonical.js';
import type { Html } from '../util/html.js';
import { COLORS } from '../style/palette.js';
import { h, join, text, n } from '../util/html.js';
import { estimateTextWidth, fmt, maxOf, niceCeil, niceCeilForAxis } from '../util/scale.js';
import { assertFiniteDomain, assertFiniteTotal, niceUpperBound } from './numeric.js';
import type { SvgMotionPlan } from './motion.js';
import {
  plot,
  svg,
  yOf,
  xOf,
  seriesTone,
  gridLines,
  categoryLabels,
  baseline,
  fadeIn,
} from './context.js';

// ───────────────────────────────────────────────────────────────
//  柱状图
// ───────────────────────────────────────────────────────────────

export interface ColumnChart {
  type: 'column';
  categories: string[];
  series: Array<{
    name?: string;
    values: (number | null)[];
  }>;
  unit?: string;
  stacked?: boolean;
  yAxis?: boolean;
  labels?: boolean;
  max?: number;
  format?: 'plain' | 'percent' | 'compact';
  precision?: number;
}

export function renderColumn(c: ColumnChart, width: number, height: number, theme?: CanonicalTheme, motion?: SvgMotionPlan): Html {
  assertPanelDimensions(c.type, width, height);
  const stacked = !!c.stacked;
  const showLabels = c.labels !== false;
  const showAxis = !!c.yAxis;

  // Signed stacks grow independently on each side of zero. Only paired,
  // finite values participate in the domain, just as in the rendering loop.
  let negativeStackMin = 0;
  const totals = stacked
    ? c.categories.map((_, i) => {
        let positive = 0;
        let negative = 0;
        for (const s of c.series) {
          const v = s.values[i];
          if (v === null || v === undefined || !Number.isFinite(v)) continue;
          if (v < 0) negative += v;
          else positive += v;
          assertFiniteTotal(c.type, positive);
          assertFiniteTotal(c.type, negative);
        }
        negativeStackMin = Math.min(negativeStackMin, negative);
        return positive;
      })
    : c.categories.map((_, i) => maxOfSeries(c.series, i));

  // 上界：有轴用 axis 阶梯（保证刻度好看），无轴用细阶梯（不浪费画布）
  const nice = showAxis ? niceCeilForAxis : niceCeil;
  const rawMax = c.max ?? niceUpperBound(c.type, maxOf(totals), nice);
  const min = Math.min(0, stacked ? niceCeilSeries(negativeStackMin) : niceFloorSeries(c.series, c.categories));
  const max = rawMax <= min ? min + 1 : rawMax;
  assertFiniteDomain(c.type, 'y', min, max);

  // 定义绘图区留白
  const p = drawablePlot(c.type, width, height, {
    top: showLabels ? 22 : 8,
    right: 8,
    bottom: 24,
    left: showAxis ? 30 : 2,
  });

  // 柱宽自动调整：少类目时居中，不把图拉扁
  const BAR_MAX = 64;
  const groupCount = stacked ? 1 : c.series.length;
  const MAX_BAND = (BAR_MAX * Math.max(1, groupCount)) / 0.42;
  const rawBand = p.w / Math.max(1, c.categories.length);

  // 如果带宽超过上限，就收窄绘图区并居中（两根柱的图是「居中一小簇」）
  const finalPlot = rawBand > MAX_BAND
    ? (() => {
        const used = MAX_BAND * c.categories.length;
        const pad = (p.w - used) / 2;
        return plot(width, height, { ...p.inset, left: p.inset.left + pad, right: p.inset.right + pad });
      })()
    : p;

  // Recentring can lose a small positive data width at very large finite
  // panel sizes. Empty categories intentionally retain the old empty plot.
  if (c.categories.length > 0 && (!Number.isFinite(finalPlot.w) || finalPlot.w <= 0)) {
    throw new RangeError('SVG column recentered drawable width must be finite and positive; reduce the panel size');
  }

  const band = finalPlot.w / Math.max(1, c.categories.length);
  const barW = Math.min(BAR_MAX, (band * 0.56) / groupCount);
  const centers = c.categories.map((_, i) => finalPlot.x0 + band * (i + 0.5));
  const zeroY = yOf(finalPlot, Math.max(min, 0), min, max);

  const bars: Html[] = [];
  const labels: Html[] = [];
  const labelRenderers: Array<() => Html> = [];
  const barSurfaces: Array<{ x: number; y: number; width: number; height: number; color: string }> = [];

  c.categories.forEach((_, ci) => {
    // Keep series order top-to-bottom on each side of zero. Positive stacks
    // retain their existing geometry; negative stacks begin at the baseline.
    const categoryBars: Html[] = [];
    let positiveUpper = totals[ci] as number;
    let negativeUpper = 0;

    c.series.forEach((s, si) => {
      const v = s.values[ci];
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      const { color, opacity } = seriesTone(si, undefined, theme);

      let x: number;
      let yTop: number;
      let barH: number;

      if (stacked) {
        x = (centers[ci] as number) - barW / 2;
        const upper = v < 0 ? negativeUpper : positiveUpper;
        const lower = v < 0 ? upper + v : upper - v;
        yTop = yOf(finalPlot, Math.max(upper, lower), min, max);
        barH = Math.abs(yOf(finalPlot, lower, min, max) - yOf(finalPlot, upper, min, max));
        if (v < 0) negativeUpper = lower;
        else positiveUpper = lower;
      } else {
        const groupW = barW * c.series.length;
        x = (centers[ci] as number) - groupW / 2 + si * barW;
        yTop = yOf(finalPlot, Math.max(0, v), min, max);
        barH = Math.abs(yOf(finalPlot, v, min, max) - zeroY);
      }

      barSurfaces.push({ x, y: yTop, width: barW, height: Math.max(0.5, barH), color });
      const mark = h('rect', {
        class: motion ? undefined : 'plt-grow',
        style: motion ? undefined : `--i:${ci * c.series.length + si}`,
        x: n(x),
        y: n(yTop),
        width: n(barW),
        height: n(Math.max(0.5, barH)),
        fill: color,
        opacity: opacity === 1 ? undefined : opacity,
      });
      if (motion && stacked) categoryBars.push(mark);
      else bars.push(motion ? motion.grow(mark, Number(n(zeroY)), height) : mark);

      // Labels keep their legacy position above each segment. For canonical
      // stacks this can be paper or another segment, not the current mark.
      // Defer contrast choice until all positive/negative rectangles are known.
      if (showLabels && barH >= 13) {
        labelRenderers.push(() => (motion ? (body: Html) => motion.fade(body) : (body: Html) => fadeIn(ci * c.series.length + si, body))(
          text(x + barW / 2, yTop - 5, fmt(v, c.format, c.precision), {
            size: 10,
            weight: 700,
            anchor: 'middle',
            fill: stacked ? (theme ? stackedLabelText(x + barW / 2, yTop - 10, barSurfaces, theme) : '#fff') : (theme?.tokens['--ink'] ?? '#051C2C'),
          })
        ));
      }
    });
    if (motion && categoryBars.length) bars.push(motion.grow(categoryBars.join(''), Number(n(zeroY)), height));
  });

  labels.push(...labelRenderers.map(render => render()));

  return svg(width, height, join(
    showAxis ? gridLines(finalPlot, min, max, 4, theme) : '',
    baseline(finalPlot, min, max, theme),
    ...bars,
    categoryLabels(finalPlot, c.categories, theme),
    ...labels,
  ));
}

// ───────────────────────────────────────────────────────────────
//  折线图
// ───────────────────────────────────────────────────────────────

export interface LineChart {
  type: 'line';
  x: number[];
  series: Array<{
    name?: string;
    y: (number | null)[];
    smooth?: boolean;
    area?: boolean;
  }>;
  unit?: string;
  yAxis?: boolean;
  labels?: boolean;
  max?: number;
}

export function renderLine(c: LineChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  const showAxis = !!c.yAxis;
  const p = drawablePlot(c.type, width, height, {
    top: 22,
    right: 8,
    bottom: 24,
    left: showAxis ? 30 : 2,
  });

  // Scan finite, paired data without argument spreads, which fail on large arrays.
  let dataMin = 0;
  let dataMax = 0;
  for (const s of c.series) {
    for (let i = 0; i < Math.min(c.x.length, s.y.length); i++) {
      const y = s.y[i];
      if (y === null || y === undefined || !Number.isFinite(y) || !Number.isFinite(c.x[i])) continue;
      dataMin = Math.min(dataMin, y);
      dataMax = Math.max(dataMax, y);
    }
  }
  const min = -niceUpperBound(c.type, -dataMin, niceCeilForAxis);
  const max = Math.max(c.max !== undefined && Number.isFinite(c.max) ? c.max : niceUpperBound(c.type, dataMax), 1);
  assertFiniteDomain(c.type, 'y', min, max);

  let xMin = Infinity;
  let xMax = -Infinity;
  for (const x of c.x) {
    if (!Number.isFinite(x)) continue;
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
  }
  if (xMin === Infinity) xMin = xMax = 0;
  assertFiniteDomain(c.type, 'x', xMin, xMax);

  const paths: Html[] = [];
  const areas: Html[] = [];

  c.series.forEach((s, si) => {
    const { color } = seriesTone(si, undefined, theme);
    const segments: Array<Array<[number, number]>> = [];
    let segment: Array<[number, number]> = [];

    for (let i = 0; i < c.x.length; i++) {
      const x = c.x[i];
      const y = s.y[i];
      if (x === undefined || y === null || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
        if (segment.length) segments.push(segment);
        segment = [];
        continue;
      }
      segment.push([xOf(p, x, xMin, xMax), yOf(p, y, min, max)]);
    }
    if (segment.length) segments.push(segment);

    for (const segment of segments) {
      const points = segment.map(([x, y]) => `${n(x)},${n(y)}`);

      // Close each area at its own endpoints, without filling missing samples.
      if (s.area) {
        const zeroY = yOf(p, Math.max(min, 0), min, max);
        const firstPx = segment[0]![0];
        const lastPx = segment[segment.length - 1]![0];
        const areaD = `M${n(firstPx)},${n(zeroY)} L${points.join(' L')} L${n(lastPx)},${n(zeroY)} Z`;
        areas.push(h('path', {
          d: areaD,
          fill: color,
          opacity: 0.15,
        }));
      }

      // A zero-length line with round caps makes isolated samples visible.
      const linePoints = points.length === 1 ? [points[0], points[0]] : points;
      paths.push(h('path', {
        d: `M${linePoints.join(' L')}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }));
    }
  });

  return svg(width, height, join(
    showAxis ? gridLines(p, min, max, 4, theme) : '',
    baseline(p, min, max, theme),
    areas.join(''),
    paths.join(''),
  ));
}

// ───────────────────────────────────────────────────────────────
//  散点图
// ───────────────────────────────────────────────────────────────

export interface ScatterChart {
  type: 'scatter';
  /** Nonfinite coordinate pairs are omitted; size is a finite non-negative circle radius in pixels. */
  points: Array<{ x: number; y: number; size?: number }>;
  unit?: string;
  yAxis?: boolean;
  xAxis?: boolean;
}

export function renderScatter(c: ScatterChart, width: number, height: number, theme?: CanonicalTheme, motion?: SvgMotionPlan): Html {
  assertPanelDimensions(c.type, width, height);
  const showAxis = !!c.yAxis;
  // Only finite coordinate pairs contribute to either domain or marker bounds.
  let maxRadius = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let dataMax = -Infinity;
  for (const pt of c.points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const size = pt.size ?? 4;
    if (!Number.isFinite(size) || size < 0) {
      throw new RangeError('Scatter size must be finite and non-negative for finite coordinate pairs');
    }
    maxRadius = Math.max(maxRadius, size);
    xMin = Math.min(xMin, pt.x);
    xMax = Math.max(xMax, pt.x);
    yMin = Math.min(yMin, pt.y);
    dataMax = Math.max(dataMax, pt.y);
  }
  // Circles have no stroke. Reserve their radius without changing the domain,
  // point order or radius. Enlarge only insufficient legacy margins; 0.01px
  // covers the two independent 0.005px rounding errors in center and radius.
  const inset = (minimum: number) => maxRadius > minimum ? maxRadius + 0.01 : minimum;
  let p = drawablePlot(c.type, width, height, {
    top: inset(10), right: inset(10), bottom: inset(24), left: inset(showAxis ? 30 : 10),
  });
  if (xMin === Infinity) xMin = xMax = yMin = dataMax = 0;
  const yMax = niceUpperBound(c.type, dataMax);
  assertFiniteDomain(c.type, 'x', xMin, xMax);
  assertFiniteDomain(c.type, 'y', yMin, yMax);

  const mapMarkers = () => c.points.flatMap((pt, i) => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return [];
    return [{ i, cx: n(xOf(p, pt.x, xMin, xMax)), cy: n(yOf(p, pt.y, yMin, yMax)), r: n(pt.size ?? 4) }];
  });
  const bounds = (mark: ReturnType<typeof mapMarkers>[number]) => ({
    x: scatterExtentBounds(mark.cx, mark.r, width), y: scatterExtentBounds(mark.cy, mark.r, height),
  });
  const fits = (bound: ReturnType<typeof bounds>) => bound.x.low && bound.x.high && bound.y.low && bound.y.high;
  let markers = mapMarkers();
  const initialBounds = markers.map(bounds);
  if (!initialBounds.every(fits)) {
    // A radius exactly equal to a legacy inset can still clip when its center
    // rounds outward at a fractional panel edge. Retry only overflowing sides;
    // already-contained output (including exact decimal edges) is kept.
    const safeInset = (minimum: number, overflow: boolean) => overflow ? Math.max(minimum, maxRadius + 0.01) : minimum;
    p = drawablePlot(c.type, width, height, {
      top: safeInset(p.inset.top, initialBounds.some(b => !b.y.low)),
      right: safeInset(p.inset.right, initialBounds.some(b => !b.x.high)),
      bottom: safeInset(p.inset.bottom, initialBounds.some(b => !b.y.high)),
      left: safeInset(p.inset.left, initialBounds.some(b => !b.x.low)),
    });
    markers = mapMarkers();
    if (!markers.map(bounds).every(fits)) {
      throw new RangeError('SVG scatter markers must fit within the panel after coordinate serialization; increase the panel size or reduce marker sizes');
    }
  }

  const { color } = seriesTone(0, undefined, theme);
  const circles = markers.map(({ i, cx, cy, r }) => {
    const mark = h('circle', {
      class: motion ? undefined : 'plt-fade',
      style: motion ? undefined : `--i:${i}`,
      cx,
      cy,
      r,
      fill: color,
      opacity: 0.7,
    });
    return motion ? motion.fade(mark, scatterMotionRise(cy, r, height)) : mark;
  });

  return svg(width, height, join(
    showAxis ? gridLines(p, yMin, yMax, 4, theme) : '',
    ...circles,
  ));
}

/** Floor exact emitted bottom slack to 0.01px, never changing static padding. */
function scatterMotionRise(center: string, radius: string, extent: number): number {
  const decimal = (value: string): { coefficient: bigint; exponent: number } => {
    const [mantissa, power = '0'] = value.split('e');
    const [whole, fraction = ''] = mantissa!.split('.');
    return { coefficient: BigInt(whole! + fraction), exponent: Number(power) - fraction.length };
  };
  const values = [decimal(center), decimal(radius), decimal(String(extent))];
  const exponent = Math.min(-2, ...values.map(value => value.exponent));
  const [c, r, end] = values.map(value => value.coefficient * 10n ** BigInt(value.exponent - exponent));
  const hundredths = (end! - c! - r!) / 10n ** BigInt(-2 - exponent);
  return Number(hundredths < 0n ? 0n : hundredths > 800n ? 800n : hundredths) / 100;
}

/** Compare the emitted decimal geometry exactly, including scientific notation.
 * Subtraction can falsely reject safe edges (40.01 - 30.01 < 10); an epsilon
 * can instead hide true clipping or a lost inset at huge finite dimensions.
 */
function scatterExtentBounds(center: string, radius: string, extent: number): { low: boolean; high: boolean } {
  const decimal = (value: string): { coefficient: bigint; exponent: number } => {
    const [mantissa, power = '0'] = value.split('e');
    const [whole, fraction = ''] = mantissa!.split('.');
    return { coefficient: BigInt(whole! + fraction), exponent: Number(power) - fraction.length };
  };
  const values = [decimal(center), decimal(radius), decimal(String(extent))];
  const exponent = Math.min(...values.map(value => value.exponent));
  const [c, r, end] = values.map(value => value.coefficient * 10n ** BigInt(value.exponent - exponent));
  return { low: r! <= c!, high: c! + r! <= end! };
}

// ───────────────────────────────────────────────────────────────
//  热力图
// ───────────────────────────────────────────────────────────────

export interface HeatmapChart {
  type: 'heatmap';
  /** Rectangular rows of finite values; empty rectangular data is allowed. */
  data: number[][];
  /** Labels beyond the columns are ignored; wide labels are ellipsized with a full-text SVG title. */
  xLabels?: string[];
  /** Labels beyond the rows are ignored; the label gutter uses at most 40% of the available width. */
  yLabels?: string[];
  colormap?: 'viridis' | 'plasma' | 'blues';
}

// Viridis 配色（10 阶）
const VIRIDIS = [
  '#440154', '#482878', '#3e4a89', '#31688e',
  '#26838e', '#1f9d8a', '#6cce5a', '#b6de2b', '#fde725'
];

// Reuse plot-ts's existing discrete palettes; preserve the original SVG viridis.
function heatmapPalette(colormap: HeatmapChart['colormap']): readonly string[] {
  switch (colormap) {
    case undefined:
    case 'viridis': return VIRIDIS;
    case 'plasma': return COLORS.plasma;
    case 'blues': return COLORS.blues;
    default: throw new RangeError('Unsupported heatmap colormap. Use viridis, plasma, or blues.');
  }
}

/** Fit only overflowing labels, retaining the legacy text bytes when they fit. */
function heatmapLabel(x: number, y: number, label: string, budget: number, anchor: 'middle' | 'end', theme?: CanonicalTheme): Html {
  const style = { size: 10, anchor, fill: theme?.tokens['--muted'] ?? 'rgba(5, 28, 44, 0.58)' };
  if (estimateTextWidth(label, 10) <= budget) return text(x, y, label, style);

  // Segment by grapheme so an ellipsis never splits surrogate pairs, combining
  // marks or joined emoji. Leave a small safety allowance for font variation.
  const ellipsis = '…';
  const ellipsisWidth = 10;
  let visible = '';
  let used = 0;
  if (budget >= ellipsisWidth) {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(label)) {
      const advance = estimateTextWidth(segment, 10);
      if (used + advance + ellipsisWidth > budget) break;
      visible += segment;
      used += advance;
    }
    visible += ellipsis;
  }
  return text(x, y, visible, {
    ...style, title: label,
    // SVG fixes the final advance width even when the consumer uses a different
    // font. A budget smaller than one ellipsis retains only the full-text title.
    ...(visible ? { textLength: Math.min(budget, used + ellipsisWidth) } : {}),
  });
}

export function renderHeatmap(c: HeatmapChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  const palette = heatmapPalette(c.colormap);
  const rows = c.data.length;
  const cols = c.data[0]?.length || 0;
  for (const row of c.data) {
    if (row.length !== cols) {
      throw new RangeError('Heatmap data must be rectangular');
    }
    for (const value of row) {
      if (!Number.isFinite(value)) {
        throw new RangeError('Heatmap values must be finite');
      }
    }
  }
  const yLabels = c.yLabels?.slice(0, rows);
  const longestY = yLabels?.reduce((length, label) => Math.max(length, label.length), 0) ?? 0;
  const labelW = Math.min(longestY * 7 + 10, Math.max(10, (width - 10) * 0.4));
  const labelH = c.xLabels ? 24 : 2;

  const p = drawablePlot(c.type, width, height, {
    top: 2,
    right: 10,
    bottom: labelH,
    left: labelW,
  });
  if (rows === 0 || cols === 0) return '';

  const cellW = p.w / cols;
  const cellH = p.h / rows;

  // 归一化
  const flat = c.data.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  assertFiniteDomain(c.type, 'color', min, max);

  const cells: Html[] = [];
  const labels: Html[] = [];

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const v = c.data[r]![col]!;
      // A constant field has no relative low/high values; use the palette midpoint.
      const fraction = min === max ? 0.5 : (v - min) / (max - min);
      const colorIdx = Math.round(fraction * (palette.length - 1));

      cells.push(h('rect', {
        x: n(p.x0 + col * cellW),
        y: n(p.y0 + r * cellH),
        width: n(cellW),
        height: n(cellH),
        fill: palette[colorIdx],
        stroke: theme?.tokens['--paper'] ?? '#fff',
        'stroke-width': 1,
      }));
    }
  }

  // Y 轴标签
  if (yLabels) {
    yLabels.forEach((label, r) => {
      labels.push(heatmapLabel(
        p.x0 - 4,
        p.y0 + r * cellH + cellH / 2 + 4,
        label,
        Math.max(0, labelW - 8), 'end', theme,
      ));
    });
  }

  // X labels use the existing bottom margin and align with actual columns.
  c.xLabels?.slice(0, cols).forEach((label, col) => {
    labels.push(heatmapLabel(
      p.x0 + (col + 0.5) * cellW,
      p.y0 + p.h + 16,
      label,
      Math.max(0, cellW - 8), 'middle', theme,
    ));
  });

  return svg(width, height, join(...cells, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  瀑布图 (Waterfall)
// ───────────────────────────────────────────────────────────────

export interface WaterfallChart {
  type: 'waterfall';
  categories: string[];
  /** Finite signed steps, with exactly one value per category. */
  values: number[];
  labels?: boolean;
  format?: 'plain' | 'percent' | 'compact';
}

export function renderWaterfall(c: WaterfallChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  if (c.categories.length !== c.values.length) {
    throw new RangeError('Waterfall categories and values must have equal lengths');
  }
  for (const value of c.values) {
    if (!Number.isFinite(value)) {
      throw new RangeError('Waterfall values must be finite');
    }
  }

  const p = drawablePlot(c.type, width, height, { top: 30, right: 20, bottom: 30, left: 40 });

  // 计算累计值
  let runningTotal = 0;
  const totals: number[] = [];
  for (const v of c.values) {
    totals.push(runningTotal);
    runningTotal += v;
    assertFiniteTotal(c.type, runningTotal);
  }

  // 每根柱子的起点和终点都参与定标，不能只用增量和最终合计。
  const allValues = [...totals, runningTotal];
  const min = Math.min(0, Math.min(...allValues));
  const max = Math.max(0, niceUpperBound(c.type, Math.max(...allValues)));
  assertFiniteDomain(c.type, 'y', min, max);
  const zeroY = yOf(p, Math.max(min, 0), min, max);

  const band = p.w / Math.max(1, c.categories.length);
  const barW = band * 0.6;

  const bars: Html[] = [];
  const labels: Html[] = [];

  c.categories.forEach((cat, ci) => {
    const v = c.values[ci]!;
    const start = totals[ci]!;
    const barY = yOf(p, Math.max(start, start + v), min, max);
    const barH = Math.abs(yOf(p, start, min, max) - yOf(p, start + v, min, max));

    const color = v >= 0 ? (theme?.tokens['--pos'] ?? '#26A69A') : (theme?.tokens['--neg'] ?? '#EF5350'); // 青增红减
    const x = p.x0 + band * ci + (band - barW) / 2;

    bars.push(h('rect', {
      x: n(x),
      y: n(barY),
      width: n(barW),
      height: n(Math.max(1, barH)),
      fill: color,
    }));

    // 数据标签
    if (c.labels !== false) {
      labels.push(text(
        x + barW / 2,
        barY - 6,
        fmt(v, c.format),
        { size: 10, weight: 700, anchor: 'middle', fill: theme?.tokens['--ink'] ?? '#051C2C' }
      ));
    }

    // 类别标签
    labels.push(text(
      x + barW / 2,
      p.y0 + p.h + 18,
      cat,
      { size: 10, anchor: 'middle', fill: theme?.tokens['--muted'] ?? 'rgba(5, 28, 44, 0.58)' }
    ));
  });

  // 零值线
  const zeroLine = h('line', {
    x1: n(p.x0),
    x2: n(p.x0 + p.w),
    y1: n(zeroY),
    y2: n(zeroY),
    stroke: theme?.tokens['--line'] ?? '#051C2C',
    'stroke-opacity': 0.16,
    'stroke-width': 1,
  });

  return svg(width, height, join(zeroLine, ...bars, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  环形图 (Donut)
// ───────────────────────────────────────────────────────────────

export interface DonutChart {
  type: 'donut';
  /** Finite non-negative shares; signed parts have no supported donut interpretation. */
  items: Array<{ name: string; value: number }>;
  holeRatio?: number;
  labels?: boolean;
}

export function renderDonut(c: DonutChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  for (const item of c.items) {
    if (!Number.isFinite(item.value)) {
      throw new RangeError('Donut values must be finite');
    }
    if (item.value < 0) {
      throw new RangeError('Donut values must be non-negative');
    }
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 20;
  assertPanelRadius(c.type, r, 40);
  const holeR = r * (c.holeRatio ?? 0.5);

  const total = c.items.reduce((sum, item) => {
    const next = sum + item.value;
    assertFiniteTotal(c.type, next);
    return next;
  }, 0);
  if (total === 0) return '';

  let startAngle = -Math.PI / 2; // 从 12 点方向开始
  const slices: Html[] = [];
  const labels: Html[] = [];

  c.items.forEach((item, i) => {
    if (item.value === 0) return;

    const ratio = item.value / total;
    const angle = ratio * 2 * Math.PI;
    const endAngle = startAngle + angle;

    // 计算弧形路径
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const x3 = cx + holeR * Math.cos(endAngle);
    const y3 = cy + holeR * Math.sin(endAngle);
    const x4 = cx + holeR * Math.cos(startAngle);
    const y4 = cy + holeR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    // Full circles need two arcs per boundary; opposite winding leaves the hole transparent.
    const path = ratio === 1
      ? `M${n(x1)},${n(y1)} A${n(r)},${n(r)} 0 0,1 ${n(2 * cx - x1)},${n(2 * cy - y1)} A${n(r)},${n(r)} 0 0,1 ${n(x1)},${n(y1)} Z M${n(x4)},${n(y4)} A${n(holeR)},${n(holeR)} 0 0,0 ${n(2 * cx - x4)},${n(2 * cy - y4)} A${n(holeR)},${n(holeR)} 0 0,0 ${n(x4)},${n(y4)} Z`
      : `M${n(x1)},${n(y1)} A${n(r)},${n(r)} 0 ${largeArc},1 ${n(x2)},${n(y2)} L${n(x3)},${n(y3)} A${n(holeR)},${n(holeR)} 0 ${largeArc},0 ${n(x4)},${n(y4)} Z`;

    const { color } = seriesTone(i, undefined, theme);
    slices.push(h('path', {
      d: path,
      fill: color,
      stroke: theme?.tokens['--paper'] ?? '#fff',
      'stroke-width': 2,
    }));

    // 标签
    if (c.labels !== false && ratio > 0.05) {
      const midAngle = startAngle + angle / 2;
      const labelR = (r + holeR) / 2;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      labels.push(text(lx, ly + 4, item.name, {
        size: 11,
        weight: 600,
        anchor: 'middle',
        fill: theme ? canonicalMarkText(color) : '#fff',
      }));
    }

    startAngle = endAngle;
  });

  return svg(width, height, join(...slices, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  雷达图 (Radar)
// ───────────────────────────────────────────────────────────────

export interface RadarChart {
  type: 'radar';
  /** Explicit maxima must be finite and positive; omitted maxima share an inferred scale. */
  axes: Array<{ name: string; max?: number }>;
  series: Array<{
    name?: string;
    /** Finite non-negative radii, including extras; missing entries remain zero. */
    values: number[];
  }>;
}

export function renderRadar(c: RadarChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  for (const series of c.series) {
    // Sparse or trailing missing entries retain the existing zero fallback.
    if (series.values.some(value => !Number.isFinite(value))) {
      throw new RangeError('Radar values must be finite');
    }
    if (series.values.some(value => value < 0)) {
      throw new RangeError('Radar values must be non-negative');
    }
  }
  for (const axis of c.axes) {
    if (axis.max !== undefined && (!Number.isFinite(axis.max) || axis.max <= 0)) {
      throw new RangeError('Radar maximum must be finite and positive');
    }
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 40;
  assertPanelRadius(c.type, r, 80);
  const axisCount = c.axes.length;
  // 所有系列和可见轴共享默认上界，保留单系列形状并使系列之间可比较。
  // A shared inferred domain is needed only by axes without explicit maxima.
  // Do not silently replace overflow/underflow with 1 or reject unused scales.
  const inferred = c.axes.some(axis => axis.max === undefined)
    ? niceUpperBound(c.type, maxOf(c.series.flatMap(s => s.values.slice(0, axisCount))))
    : 0;
  const sharedMax = inferred > 0 ? inferred : 1;
  const maxima = c.axes.map(axis => axis.max ?? sharedMax);

  const polygons: Html[] = [];
  const circles: Html[] = [];
  const lines: Html[] = [];
  const labels: Html[] = [];

  // 背景网格圆
  for (let i = 1; i <= 3; i++) {
    const gridR = (r * i) / 3;
    if (!Number.isFinite(gridR) || gridR <= 0) {
      throw new RangeError('SVG radar grid radii must be finite and positive; reduce the panel size');
    }
    circles.push(h('circle', {
      cx: n(cx),
      cy: n(cy),
      r: n(gridR),
      fill: 'none',
      stroke: theme?.tokens['--grid'] ?? '#E6E8EA',
      'stroke-width': 1,
    }));
  }

  // 轴线
  c.axes.forEach((axis, i) => {
    const angle = (i / axisCount) * 2 * Math.PI - Math.PI / 2;
    const endX = cx + r * Math.cos(angle);
    const endY = cy + r * Math.sin(angle);
    lines.push(h('line', {
      x1: n(cx),
      y1: n(cy),
      x2: n(endX),
      y2: n(endY),
      stroke: theme?.tokens['--grid'] ?? '#E6E8EA',
      'stroke-width': 1,
    }));

    // 轴标签
    const labelR = r + 15;
    const labelX = cx + labelR * Math.cos(angle);
    const labelY = cy + labelR * Math.sin(angle);
    labels.push(text(labelX, labelY + 4, axis.name, {
      size: 11,
      anchor: 'middle',
      fill: theme?.tokens['--ink'] ?? '#051C2C',
    }));
  });

  // 数据多边形
  c.series.forEach((s, si) => {
    const points: string[] = [];
    c.axes.forEach((_, ai) => {
      const ratio = Math.min(1, (s.values[ai] ?? 0) / maxima[ai]!);
      const angle = (ai / axisCount) * 2 * Math.PI - Math.PI / 2;
      const px = cx + r * ratio * Math.cos(angle);
      const py = cy + r * ratio * Math.sin(angle);
      points.push(`${n(px)},${n(py)}`);
    });

    const { color, opacity } = seriesTone(si, undefined, theme);
    polygons.push(h('polygon', {
      points: points.join(' '),
      fill: color,
      opacity: opacity * 0.5,
      stroke: color,
      'stroke-width': 2,
    }));
  });

  return svg(width, height, join(...circles, ...lines, ...polygons, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  仪表盘 (Gauge)
// ───────────────────────────────────────────────────────────────

export interface GaugeChart {
  type: 'gauge';
  /** Finite value; values outside an explicit scale clamp to its endpoints. */
  value: number;
  /** Finite positive maximum. If omitted, zero uses 1; negative values require an explicit max. */
  max?: number;
  title?: string;
  unit?: string;
  /** Finite endpoints with 0 <= from <= to <= max; gaps, overlaps and zero spans are allowed. */
  bands?: Array<{ from: number; to: number; color: string }>;
}

export function renderGauge(c: GaugeChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  if (!Number.isFinite(c.value)) {
    throw new RangeError('Gauge value must be finite');
  }
  const max = c.max ?? (c.value === 0 ? 1 : niceCeil(c.value));
  if (!Number.isFinite(max) || max <= 0) {
    throw new RangeError('Gauge maximum must be finite and positive');
  }
  if (c.bands !== undefined) {
    if (!Array.isArray(c.bands)) {
      throw new RangeError('Gauge bands must be an array');
    }
    for (const band of c.bands) {
      if (!band || !Number.isFinite(band.from) || !Number.isFinite(band.to)) {
        throw new RangeError('Gauge band endpoints must be finite');
      }
      if (band.from < 0 || band.to < band.from || band.to > max) {
        throw new RangeError('Gauge band endpoints must satisfy 0 <= from <= to <= maximum');
      }
    }
  }

  const cx = width / 2;
  const cy = height * 0.7;
  const r = Math.min(width, height) * 0.4;
  assertPanelRadius(c.type, r, 0);
  const ratio = Math.min(1, Math.max(0, c.value / max));

  const startAngle = Math.PI * 0.8;
  const endAngle = Math.PI * 2.2;
  const angleRange = endAngle - startAngle;

  const bands: Html[] = [];
  const arcs = c.bands ?? [
    { from: 0, to: max * 0.6, color: theme?.tokens['--pos'] ?? '#4CAF50' },
    { from: max * 0.6, to: max * 0.85, color: theme?.tokens['--warn'] ?? '#FFC107' },
    { from: max * 0.85, to: max, color: theme?.tokens['--neg'] ?? '#F44336' },
  ];

  arcs.forEach(band => {
    const fromRatio = band.from / max;
    const toRatio = band.to / max;
    const a1 = startAngle + fromRatio * angleRange;
    const a2 = startAngle + toRatio * angleRange;

    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);

    const innerR = r * 0.7;
    const x3 = cx + innerR * Math.cos(a2);
    const y3 = cy + innerR * Math.sin(a2);
    const x4 = cx + innerR * Math.cos(a1);
    const y4 = cy + innerR * Math.sin(a1);

    // The 252-degree dial exceeds a semicircle above 5/7 of its domain.
    const largeArc = (band.to - band.from) / max > 5 / 7 ? 1 : 0;
    const path = `M${n(x1)},${n(y1)} A${n(r)},${n(r)} 0 ${largeArc},1 ${n(x2)},${n(y2)} L${n(x3)},${n(y3)} A${n(innerR)},${n(innerR)} 0 ${largeArc},0 ${n(x4)},${n(y4)} Z`;
    bands.push(h('path', { d: path, fill: band.color, opacity: 0.8 }));
  });

  // 指针
  const pointerAngle = startAngle + ratio * angleRange;
  const pointerR = r * 0.65;
  const px = cx + pointerR * Math.cos(pointerAngle);
  const py = cy + pointerR * Math.sin(pointerAngle);

  const pointer = h('polygon', {
    points: `${n(cx)},${n(cy - 8)} ${n(cx - 4)},${n(cy + 5)} ${n(px)},${n(py)} ${n(cx + 4)},${n(cy + 5)}`,
    fill: theme?.tokens['--ink'] ?? '#051C2C',
  });

  const center = h('circle', { cx: n(cx), cy: n(cy), r: 10, fill: theme?.tokens['--ink'] ?? '#051C2C' });

  // 数值显示
  const valueText = text(cx, cy - r - 20, fmt(c.value) + (c.unit || ''), {
    size: 24,
    weight: 700,
    anchor: 'middle',
    fill: theme?.tokens['--ink'] ?? '#051C2C',
  });

  return svg(width, height, join(...bands, pointer, center, valueText));
}

// ───────────────────────────────────────────────────────────────
//  斜率图 (Slope)
// ───────────────────────────────────────────────────────────────

export interface SlopeChart {
  type: 'slope';
  /** Both endpoints must be finite; signed values are allowed. */
  items: Array<{ name: string; left: number; right: number }>;
  leftTitle?: string;
  rightTitle?: string;
  max?: number;
}

export function renderSlope(c: SlopeChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  for (const item of c.items) {
    if (!Number.isFinite(item.left) || !Number.isFinite(item.right)) {
      throw new RangeError('Slope endpoints must be finite');
    }
  }

  const p = drawablePlot(c.type, width, height, { top: 30, right: 80, bottom: 30, left: 80 });

  const allValues = c.items.flatMap(i => [i.left, i.right]);
  const min = Math.min(0, Math.min(...allValues));
  const max = c.max ?? niceUpperBound(c.type, Math.max(...allValues));
  assertFiniteDomain(c.type, 'y', min, max);

  const leftX = p.x0;
  const rightX = p.x0 + p.w;

  const lines: Html[] = [];
  const dots: Html[] = [];
  const labels: Html[] = [];

  c.items.forEach((item, i) => {
    const { color } = seriesTone(i, undefined, theme);
    const yLeft = yOf(p, item.left, min, max);
    const yRight = yOf(p, item.right, min, max);

    // 连线
    lines.push(h('line', {
      x1: n(leftX),
      y1: n(yLeft),
      x2: n(rightX),
      y2: n(yRight),
      stroke: color,
      'stroke-width': 2,
    }));

    // 两端圆点
    dots.push(h('circle', { cx: n(leftX), cy: n(yLeft), r: 5, fill: color }));
    dots.push(h('circle', { cx: n(rightX), cy: n(yRight), r: 5, fill: color }));

    // 左右标签
    labels.push(text(leftX - 12, yLeft + 4, item.name, {
      size: 11,
      anchor: 'end',
      fill: theme?.tokens['--ink'] ?? '#051C2C',
    }));
    labels.push(text(rightX + 12, yRight + 4, fmt(item.right), {
      size: 11,
      weight: 600,
      anchor: 'start',
      fill: color,
    }));
  });

  // 标题
  if (c.leftTitle || c.rightTitle) {
    labels.push(text(leftX, p.y0 - 15, c.leftTitle ?? '', {
      size: 12,
      weight: 700,
      anchor: 'middle',
      fill: theme?.tokens['--ink'] ?? '#051C2C',
    }));
    labels.push(text(rightX, p.y0 - 15, c.rightTitle ?? '', {
      size: 12,
      weight: 700,
      anchor: 'middle',
      fill: theme?.tokens['--ink'] ?? '#051C2C',
    }));
  }

  return svg(width, height, join(...lines, ...dots, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  金字塔图 (Pyramid)
// ───────────────────────────────────────────────────────────────

export interface PyramidChart {
  type: 'pyramid';
  /** Finite non-negative values; all-zero layers retain labels with zero width. */
  layers: Array<{ name: string; value: number }>;
}

export function renderPyramid(c: PyramidChart, width: number, height: number, theme?: CanonicalTheme): Html {
  assertPanelDimensions(c.type, width, height);
  if (c.layers.some(layer => !Number.isFinite(layer.value) || layer.value < 0)) {
    throw new RangeError('Pyramid values must be finite and non-negative');
  }

  const p = drawablePlot(c.type, width, height, { top: 10, right: 100, bottom: 10, left: 100 });

  const observedMax = Math.max(0, ...c.layers.map(l => l.value));
  const max = observedMax === 0 ? 1 : niceCeil(observedMax);
  if (!Number.isFinite(max) || max <= 0) {
    throw new RangeError('Pyramid maximum must be finite and positive');
  }
  const layerH = p.h / c.layers.length;
  const layers: Html[] = [];
  const labels: Html[] = [];

  c.layers.forEach((layer, i) => {
    const ratio = layer.value / max;
    const layerW = p.w * ratio;
    const x = p.x0 + (p.w - layerW) / 2;
    const y = p.y0 + i * layerH;

    const { color } = seriesTone(i, undefined, theme);

    layers.push(h('rect', {
      x: n(x),
      y: n(y),
      width: n(layerW),
      height: n(layerH * 0.85),
      fill: color,
    }));

    // 左侧名称
    labels.push(text(x - 8, y + layerH / 2 + 4, layer.name, {
      size: 11,
      anchor: 'end',
      fill: theme?.tokens['--ink'] ?? '#051C2C',
    }));

    // 右侧数值
    labels.push(text(x + layerW + 8, y + layerH / 2 + 4, fmt(layer.value), {
      size: 11,
      weight: 600,
      anchor: 'start',
      fill: color,
    }));
  });

  return svg(width, height, join(...layers, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  辅助函数
// ───────────────────────────────────────────────────────────────

/** Sample the rendered surface under the existing above-segment label center. */
function stackedLabelText(x: number, y: number, surfaces: Array<{ x: number; y: number; width: number; height: number; color: string }>, theme: CanonicalTheme): string {
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]!;
    if (x >= surface.x && x <= surface.x + surface.width && y >= surface.y && y <= surface.y + surface.height) {
      return canonicalMarkText(surface.color);
    }
  }
  return canonicalMarkText(theme.tokens['--paper']);
}

/** Validate direct renderers too, before a chart can emit an invalid viewport. */
function assertPanelDimensions(chart: string, width: number, height: number): void {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError(`SVG ${chart} panel width and height must be finite positive numbers`);
  }
}

/** Use the renderer's actual insets, without changing any supported geometry. */
function drawablePlot(chart: string, width: number, height: number, inset: Parameters<typeof plot>[2]): ReturnType<typeof plot> {
  const p = plot(width, height, inset);
  assertDrawablePlot(chart, p);
  return p;
}

function assertDrawablePlot(chart: string, p: ReturnType<typeof plot>): void {
  if (!Number.isFinite(p.w) || p.w <= 0 || !Number.isFinite(p.h) || p.h <= 0) {
    throw new RangeError(
      `SVG ${chart} drawable width and height must be positive after margins; ` +
      `panel width must exceed ${p.inset.left + p.inset.right} pixels and height must exceed ${p.inset.top + p.inset.bottom} pixels`,
    );
  }
}

function assertPanelRadius(chart: string, radius: number, margin: number): void {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError(
      `SVG ${chart} radius must be positive; panel width and height must exceed ${margin} pixels`,
    );
  }
}

function sumSeries(series: ColumnChart['series'], idx: number): number {
  let s = 0;
  for (const ser of series) {
    const v = ser.values[idx];
    if (v !== null && v !== undefined && Number.isFinite(v)) s += v;
  }
  return s;
}

function maxOfSeries(series: ColumnChart['series'], idx: number): number {
  let m = -Infinity;
  for (const ser of series) {
    const v = ser.values[idx];
    if (v !== null && v !== undefined && Number.isFinite(v) && v > m) m = v;
  }
  return m === -Infinity ? 0 : m;
}

function niceFloorSeries(series: ColumnChart['series'], categories: string[]): number {
  let m = Infinity;
  for (const ser of series) {
    // Match the rendering loop: unpaired values cannot affect the domain.
    categories.forEach((_, i) => {
      const v = ser.values[i];
      if (v !== null && v !== undefined && Number.isFinite(v) && v < m) m = v;
    });
  }
  return niceCeilSeries(m);
}

function niceCeilSeries(v: number): number {
  if (v >= 0) return 0;
  return -niceUpperBound('column', -v);
}
