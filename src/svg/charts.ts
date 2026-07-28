/**
 * SVG 图表渲染器 —— 纯函数，输入配置，输出 SVG 字符串。
 * 零浏览器依赖，可在 Node.js 直接运行。
 *
 * 设计原则：
 * 1. 所有输入都是纯数据（不依赖 DOM）
 * 2. 输出是 SVG 字符串，可直接写入文件或嵌入 HTML
 * 3. 动画通过 CSS class 标记，在浏览器端自动播放
 */

import type { Html } from '../util/html.js';
import { h, join, text, n } from '../util/html.js';
import { fmt, maxOf, niceCeil, niceCeilForAxis } from '../util/scale.js';
import {
  plot,
  svg,
  yOf,
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

export function renderColumn(c: ColumnChart, width: number, height: number): Html {
  const stacked = !!c.stacked;
  const showLabels = c.labels !== false;
  const showAxis = !!c.yAxis;

  // 计算每根柱子的高度总和
  const totals = stacked
    ? c.categories.map((_, i) => sumSeries(c.series, i))
    : c.categories.map((_, i) => maxOfSeries(c.series, i));

  // 上界：有轴用 axis 阶梯（保证刻度好看），无轴用细阶梯（不浪费画布）
  const nice = showAxis ? niceCeilForAxis : niceCeil;
  const rawMax = c.max ?? nice(maxOf(totals));
  const min = Math.min(0, niceFloorSeries(c.series));
  const max = rawMax <= min ? min + 1 : rawMax;

  // 定义绘图区留白
  const p = plot(width, height, {
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

  const band = finalPlot.w / Math.max(1, c.categories.length);
  const barW = Math.min(BAR_MAX, (band * 0.56) / groupCount);
  const centers = c.categories.map((_, i) => finalPlot.x0 + band * (i + 0.5));
  const zeroY = yOf(finalPlot, Math.max(min, 0), min, max);

  const bars: Html[] = [];
  const labels: Html[] = [];

  c.categories.forEach((_, ci) => {
    // 堆叠**自上而下**：series[0] 是最上面那一段。
    // 数组从上往下读，图例次序与图形必须一致。
    let upper = totals[ci] as number;

    c.series.forEach((s, si) => {
      const v = s.values[ci];
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      const { color, opacity } = seriesTone(si);

      let x: number;
      let yTop: number;
      let barH: number;

      if (stacked) {
        x = (centers[ci] as number) - barW / 2;
        const lower = upper - v;
        yTop = yOf(finalPlot, Math.max(upper, lower), min, max);
        barH = Math.abs(yOf(finalPlot, lower, min, max) - yOf(finalPlot, upper, min, max));
        upper = lower;
      } else {
        const groupW = barW * c.series.length;
        x = (centers[ci] as number) - groupW / 2 + si * barW;
        yTop = yOf(finalPlot, Math.max(0, v), min, max);
        barH = Math.abs(yOf(finalPlot, v, min, max) - zeroY);
      }

      bars.push(h('rect', {
        class: 'plt-grow',
        style: `--i:${ci * c.series.length + si}`,
        x: n(x),
        y: n(yTop),
        width: n(barW),
        height: n(Math.max(0.5, barH)),
        fill: color,
        opacity: opacity === 1 ? undefined : opacity,
      }));

      // 数据标签：堆叠时在段内（白字），分组时在柱顶上方
      if (showLabels && barH >= 13) {
        labels.push(fadeIn(
          ci * c.series.length + si,
          text(x + barW / 2, yTop - 5, fmt(v, c.format, c.precision), {
            size: 10,
            weight: 700,
            anchor: 'middle',
            fill: stacked ? '#fff' : '#051C2C',
          })
        ));
      }
    });
  });

  return svg(width, height, join(
    showAxis ? gridLines(finalPlot, min, max) : '',
    baseline(finalPlot, min, max),
    ...bars,
    categoryLabels(finalPlot, c.categories),
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

export function renderLine(c: LineChart, width: number, height: number): Html {
  const showAxis = !!c.yAxis;
  const p = plot(width, height, {
    top: 22,
    right: 8,
    bottom: 24,
    left: showAxis ? 30 : 2,
  });

  // 计算全局值域
  const allValues = c.series.flatMap(s => s.y.filter(v => v !== null) as number[]);
  const dataMin = Math.min(0, Math.min(...allValues));
  const dataMax = c.max ?? niceCeil(Math.max(...allValues));
  const min = niceCeilForAxis(dataMin) * (dataMin < 0 ? -1 : 0);
  const max = Math.max(dataMax, 1);

  const xMin = Math.min(...c.x);
  const xMax = Math.max(...c.x);

  const paths: Html[] = [];
  const areas: Html[] = [];

  c.series.forEach((s, si) => {
    const { color } = seriesTone(si);
    const points: string[] = [];

    for (let i = 0; i < c.x.length; i++) {
      const y = s.y[i];
      if (y === null || y === undefined) continue;
      const px = p.x0 + ((c.x[i]! - xMin) / (xMax - xMin)) * p.w;
      const py = yOf(p, y, min, max);
      points.push(`${n(px)},${n(py)}`);
    }

    if (points.length === 0) return;

    // 面积填充
    if (s.area) {
      const zeroY = yOf(p, Math.max(min, 0), min, max);
      const firstPx = p.x0 + ((c.x[0]! - xMin) / (xMax - xMin)) * p.w;
      const lastPx = p.x0 + ((c.x[c.x.length - 1]! - xMin) / (xMax - xMin)) * p.w;
      const areaD = `M${firstPx},${n(zeroY)} L${points.join(' L')} L${lastPx},${n(zeroY)} Z`;
      areas.push(h('path', {
        d: areaD,
        fill: color,
        opacity: 0.15,
      }));
    }

    // 折线
    paths.push(h('path', {
      d: `M${points.join(' L')}`,
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }));
  });

  return svg(width, height, join(
    showAxis ? gridLines(p, min, max) : '',
    baseline(p, min, max),
    ...areas,
    ...paths,
  ));
}

// ───────────────────────────────────────────────────────────────
//  散点图
// ───────────────────────────────────────────────────────────────

export interface ScatterChart {
  type: 'scatter';
  points: Array<{ x: number; y: number; size?: number }>;
  unit?: string;
  yAxis?: boolean;
  xAxis?: boolean;
}

export function renderScatter(c: ScatterChart, width: number, height: number): Html {
  const showAxis = !!c.yAxis;
  const p = plot(width, height, {
    top: 10,
    right: 10,
    bottom: 24,
    left: showAxis ? 30 : 10,
  });

  const allX = c.points.map(p => p.x);
  const allY = c.points.map(p => p.y);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMin = Math.min(...allY);
  const yMax = niceCeil(Math.max(...allY));

  const { color } = seriesTone(0);
  const circles: Html[] = [];

  c.points.forEach((pt, i) => {
    const px = p.x0 + ((pt.x - xMin) / (xMax - xMin)) * p.w;
    const py = yOf(p, pt.y, yMin, yMax);
    const size = pt.size ?? 4;

    circles.push(h('circle', {
      class: 'plt-fade',
      style: `--i:${i}`,
      cx: n(px),
      cy: n(py),
      r: n(size),
      fill: color,
      opacity: 0.7,
    }));
  });

  return svg(width, height, join(
    showAxis ? gridLines(p, yMin, yMax) : '',
    ...circles,
  ));
}

// ───────────────────────────────────────────────────────────────
//  热力图
// ───────────────────────────────────────────────────────────────

export interface HeatmapChart {
  type: 'heatmap';
  data: number[][];
  xLabels?: string[];
  yLabels?: string[];
  colormap?: 'viridis' | 'plasma' | 'blues';
}

// Viridis 配色（10 阶）
const VIRIDIS = [
  '#440154', '#482878', '#3e4a89', '#31688e',
  '#26838e', '#1f9d8a', '#6cce5a', '#b6de2b', '#fde725'
];

export function renderHeatmap(c: HeatmapChart, width: number, height: number): Html {
  const rows = c.data.length;
  const cols = c.data[0]?.length || 0;
  if (rows === 0 || cols === 0) return '';

  const labelW = c.yLabels ? Math.max(...c.yLabels.map(l => l.length)) * 7 + 10 : 10;
  const labelH = c.xLabels ? 24 : 2;

  const p = plot(width, height, {
    top: 2,
    right: 10,
    bottom: labelH,
    left: labelW,
  });

  const cellW = p.w / cols;
  const cellH = p.h / rows;

  // 归一化
  const flat = c.data.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  const cells: Html[] = [];
  const labels: Html[] = [];

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const v = c.data[r]![col]!;
      const colorIdx = Math.round(((v - min) / (max - min)) * (VIRIDIS.length - 1));

      cells.push(h('rect', {
        x: n(p.x0 + col * cellW),
        y: n(p.y0 + r * cellH),
        width: n(cellW),
        height: n(cellH),
        fill: VIRIDIS[colorIdx],
        stroke: '#fff',
        'stroke-width': 1,
      }));
    }
  }

  // Y 轴标签
  if (c.yLabels) {
    c.yLabels.forEach((label, r) => {
      labels.push(text(
        p.x0 - 4,
        p.y0 + r * cellH + cellH / 2 + 4,
        label,
        { size: 10, anchor: 'end', fill: 'rgba(5, 28, 44, 0.58)' }
      ));
    });
  }

  return svg(width, height, join(...cells, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  辅助函数
// ───────────────────────────────────────────────────────────────

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

function niceFloorSeries(series: ColumnChart['series']): number {
  let m = Infinity;
  for (const ser of series) {
    for (const v of ser.values) {
      if (v !== null && v !== undefined && Number.isFinite(v) && v < m) m = v;
    }
  }
  return niceCeilSeries(m);
}

function niceCeilSeries(v: number): number {
  if (v >= 0) return 0;
  return -niceCeil(-v);
}
