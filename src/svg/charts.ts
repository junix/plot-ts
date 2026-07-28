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
//  瀑布图 (Waterfall)
// ───────────────────────────────────────────────────────────────

export interface WaterfallChart {
  type: 'waterfall';
  categories: string[];
  values: number[];
  labels?: boolean;
  format?: 'plain' | 'percent' | 'compact';
}

export function renderWaterfall(c: WaterfallChart, width: number, height: number): Html {
  const p = plot(width, height, { top: 30, right: 20, bottom: 30, left: 40 });

  // 计算累计值
  let runningTotal = 0;
  const totals: number[] = [];
  for (const v of c.values) {
    totals.push(runningTotal);
    runningTotal += v;
  }

  const allValues = [...c.values, runningTotal];
  const min = Math.min(0, Math.min(...allValues));
  const max = Math.max(0, niceCeil(Math.max(...allValues)));
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

    const color = v >= 0 ? '#26A69A' : '#EF5350'; // 青增红减
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
        { size: 10, weight: 700, anchor: 'middle', fill: '#051C2C' }
      ));
    }

    // 类别标签
    labels.push(text(
      x + barW / 2,
      p.y0 + p.h + 18,
      cat,
      { size: 10, anchor: 'middle', fill: 'rgba(5, 28, 44, 0.58)' }
    ));
  });

  // 零值线
  const zeroLine = h('line', {
    x1: n(p.x0),
    x2: n(p.x0 + p.w),
    y1: n(zeroY),
    y2: n(zeroY),
    stroke: '#051C2C',
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
  items: Array<{ name: string; value: number }>;
  holeRatio?: number;
  labels?: boolean;
}

export function renderDonut(c: DonutChart, width: number, height: number): Html {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 20;
  const holeR = r * (c.holeRatio ?? 0.5);

  const total = c.items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return '';

  let startAngle = -Math.PI / 2; // 从 12 点方向开始
  const slices: Html[] = [];
  const labels: Html[] = [];

  c.items.forEach((item, i) => {
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

    const path = `M${n(x1)},${n(y1)} A${n(r)},${n(r)} 0 ${largeArc},1 ${n(x2)},${n(y2)} L${n(x3)},${n(y3)} A${n(holeR)},${n(holeR)} 0 ${largeArc},0 ${n(x4)},${n(y4)} Z`;

    const { color } = seriesTone(i);
    slices.push(h('path', {
      d: path,
      fill: color,
      stroke: '#fff',
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
        fill: '#fff',
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
  axes: Array<{ name: string; max?: number }>;
  series: Array<{
    name?: string;
    values: number[];
  }>;
}

export function renderRadar(c: RadarChart, width: number, height: number): Html {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 40;
  const axisCount = c.axes.length;

  const polygons: Html[] = [];
  const circles: Html[] = [];
  const lines: Html[] = [];
  const labels: Html[] = [];

  // 背景网格圆
  for (let i = 1; i <= 3; i++) {
    const gridR = (r * i) / 3;
    circles.push(h('circle', {
      cx: n(cx),
      cy: n(cy),
      r: n(gridR),
      fill: 'none',
      stroke: '#E6E8EA',
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
      stroke: '#E6E8EA',
      'stroke-width': 1,
    }));

    // 轴标签
    const labelR = r + 15;
    const labelX = cx + labelR * Math.cos(angle);
    const labelY = cy + labelR * Math.sin(angle);
    labels.push(text(labelX, labelY + 4, axis.name, {
      size: 11,
      anchor: 'middle',
      fill: '#051C2C',
    }));
  });

  // 数据多边形
  c.series.forEach((s, si) => {
    const points: string[] = [];
    c.axes.forEach((axis, ai) => {
      const max = axis.max ?? niceCeil(Math.max(...s.values));
      const ratio = Math.min(1, (s.values[ai] ?? 0) / max);
      const angle = (ai / axisCount) * 2 * Math.PI - Math.PI / 2;
      const px = cx + r * ratio * Math.cos(angle);
      const py = cy + r * ratio * Math.sin(angle);
      points.push(`${n(px)},${n(py)}`);
    });

    const { color, opacity } = seriesTone(si);
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
  value: number;
  max?: number;
  title?: string;
  unit?: string;
  bands?: Array<{ from: number; to: number; color: string }>;
}

export function renderGauge(c: GaugeChart, width: number, height: number): Html {
  const cx = width / 2;
  const cy = height * 0.7;
  const r = Math.min(width, height) * 0.4;
  const max = c.max ?? niceCeil(c.value);
  const ratio = Math.min(1, Math.max(0, c.value / max));

  const startAngle = Math.PI * 0.8;
  const endAngle = Math.PI * 2.2;
  const angleRange = endAngle - startAngle;

  const bands: Html[] = [];
  const arcs = c.bands ?? [
    { from: 0, to: max * 0.6, color: '#4CAF50' },
    { from: max * 0.6, to: max * 0.85, color: '#FFC107' },
    { from: max * 0.85, to: max, color: '#F44336' },
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

    const path = `M${n(x1)},${n(y1)} A${n(r)},${n(r)} 0 0,1 ${n(x2)},${n(y2)} L${n(x3)},${n(y3)} A${n(innerR)},${n(innerR)} 0 0,0 ${n(x4)},${n(y4)} Z`;
    bands.push(h('path', { d: path, fill: band.color, opacity: 0.8 }));
  });

  // 指针
  const pointerAngle = startAngle + ratio * angleRange;
  const pointerR = r * 0.65;
  const px = cx + pointerR * Math.cos(pointerAngle);
  const py = cy + pointerR * Math.sin(pointerAngle);

  const pointer = h('polygon', {
    points: `${n(cx)},${n(cy - 8)} ${n(cx - 4)},${n(cy + 5)} ${n(px)},${n(py)} ${n(cx + 4)},${n(cy + 5)}`,
    fill: '#051C2C',
  });

  const center = h('circle', { cx: n(cx), cy: n(cy), r: 10, fill: '#051C2C' });

  // 数值显示
  const valueText = text(cx, cy - r - 20, fmt(c.value) + (c.unit || ''), {
    size: 24,
    weight: 700,
    anchor: 'middle',
    fill: '#051C2C',
  });

  return svg(width, height, join(...bands, pointer, center, valueText));
}

// ───────────────────────────────────────────────────────────────
//  斜率图 (Slope)
// ───────────────────────────────────────────────────────────────

export interface SlopeChart {
  type: 'slope';
  items: Array<{ name: string; left: number; right: number }>;
  leftTitle?: string;
  rightTitle?: string;
  max?: number;
}

export function renderSlope(c: SlopeChart, width: number, height: number): Html {
  const p = plot(width, height, { top: 30, right: 80, bottom: 30, left: 80 });

  const allValues = c.items.flatMap(i => [i.left, i.right]);
  const min = Math.min(0, Math.min(...allValues));
  const max = c.max ?? niceCeil(Math.max(...allValues));

  const leftX = p.x0;
  const rightX = p.x0 + p.w;

  const lines: Html[] = [];
  const dots: Html[] = [];
  const labels: Html[] = [];

  c.items.forEach((item, i) => {
    const { color } = seriesTone(i);
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
      fill: '#051C2C',
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
      fill: '#051C2C',
    }));
    labels.push(text(rightX, p.y0 - 15, c.rightTitle ?? '', {
      size: 12,
      weight: 700,
      anchor: 'middle',
      fill: '#051C2C',
    }));
  }

  return svg(width, height, join(...lines, ...dots, ...labels));
}

// ───────────────────────────────────────────────────────────────
//  金字塔图 (Pyramid)
// ───────────────────────────────────────────────────────────────

export interface PyramidChart {
  type: 'pyramid';
  layers: Array<{ name: string; value: number }>;
}

export function renderPyramid(c: PyramidChart, width: number, height: number): Html {
  const p = plot(width, height, { top: 10, right: 100, bottom: 10, left: 100 });

  const max = niceCeil(Math.max(...c.layers.map(l => l.value)));
  const layerH = p.h / c.layers.length;
  const layers: Html[] = [];
  const labels: Html[] = [];

  c.layers.forEach((layer, i) => {
    const ratio = layer.value / max;
    const layerW = p.w * ratio;
    const x = p.x0 + (p.w - layerW) / 2;
    const y = p.y0 + i * layerH;

    const { color } = seriesTone(i);

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
      fill: '#051C2C',
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
