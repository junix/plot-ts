/**
 * plot-ts SVG 渲染引擎 —— 纯函数、零浏览器依赖、Node.js 可运行。
 *
 * 设计目标：
 * 1. Matplotlib 风格的 API：figure(), plot(), scatter(), bar(), heatmap()
 * 2. 输出标准 SVG 字符串，可直接保存为 .svg 或嵌入 HTML
 * 3. 专业商业图表风格（参考 ppt-gen）：4 色原则、无多余装饰
 *
 * 与 ECharts 引擎的区别：
 * - SVG 引擎：✅ 服务端可用  ✅ 零运行时  ✅ 可打印的 PDF
 * - ECharts 引擎：✅ 交互丰富  ✅ 动画流畅  ✅ 大数据性能好
 */

import { getCanonicalTheme, type CanonicalTheme, type CanonicalThemeName } from '../style/canonical.js';
export { CANONICAL_THEME_NAMES, getCanonicalTheme, type CanonicalThemeName, type CanonicalTheme, type CanonicalTokenName } from '../style/canonical.js';
import type { Html } from '../util/html.js';
import { esc, h, join } from '../util/html.js';
import { generateStyles, palette, type AccentName } from '../style/tokens.js';
import {
  renderColumn,
  renderLine,
  renderScatter,
  renderHeatmap,
  renderWaterfall,
  renderDonut,
  renderRadar,
  renderGauge,
  renderSlope,
  renderPyramid,
} from './charts.js';
import type {
  ColumnChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  WaterfallChart,
  DonutChart,
  RadarChart,
  GaugeChart,
  SlopeChart,
  PyramidChart,
} from './charts.js';

export type Chart =
  | ColumnChart
  | LineChart
  | ScatterChart
  | HeatmapChart
  | WaterfallChart
  | DonutChart
  | RadarChart
  | GaugeChart
  | SlopeChart
  | PyramidChart;

export interface SvgFigureOptions {
  /** Finite positive canvas width; each chart also needs a positive drawable area. */
  width?: number;
  /** Finite positive canvas height; a nonempty figure title reserves 40 pixels. */
  height?: number;
  title?: string;
  accent?: AccentName;
  /** Opt in to a pinned canonical theme; omitted keeps the exact legacy output. */
  theme?: CanonicalThemeName;
  animated?: boolean;
  /** Independent panels per row; defaults to a near-square grid. */
  columns?: number;
  /** Space between panels in pixels. Defaults to 16. */
  gap?: number;
}

/**
 * SVG Figure - Matplotlib 风格的绘图对象。
 *
 * 示例：
 * ```typescript
 * import { figure } from 'plot-ts/svg';
 *
 * const svg = figure({ width: 800, height: 500 })
 *   .bar({
 *     categories: ['A', 'B', 'C'],
 *     series: [{ values: [10, 20, 30] }]
 *   })
 *   .render();
 * ```
 */
export class SvgFigure {
  private width: number;
  private height: number;
  private title: string | undefined;
  private accent: AccentName;
  private theme: CanonicalTheme | undefined;
  private columns: number | undefined;
  private gap: number;
  private charts: Chart[] = [];

  constructor(options: SvgFigureOptions = {}) {
    this.width = options.width ?? 800;
    this.height = options.height ?? 500;
    this.title = options.title;
    this.accent = options.accent ?? 'cyan';
    this.theme = options.theme === undefined ? undefined : getCanonicalTheme(options.theme);
    this.columns = options.columns;
    this.gap = options.gap ?? 16;
    if (!Number.isFinite(this.width) || this.width <= 0 ||
        !Number.isFinite(this.height) || this.height <= 0) {
      throw new RangeError('SVG figure width and height must be finite positive numbers');
    }
    if (this.columns !== undefined &&
        (!Number.isSafeInteger(this.columns) || this.columns < 1)) {
      throw new RangeError('SVG figure columns must be a positive safe integer');
    }
    if (!Number.isFinite(this.gap) || this.gap < 0) {
      throw new RangeError('SVG figure gap must be a finite non-negative number');
    }
  }

  /** 柱状图 */
  bar(config: Omit<ColumnChart, 'type'>): this {
    this.charts.push({ type: 'column', ...config });
    return this;
  }

  /** 折线图 */
  line(config: Omit<LineChart, 'type'>): this {
    this.charts.push({ type: 'line', ...config });
    return this;
  }

  /** 散点图 */
  scatter(config: Omit<ScatterChart, 'type'>): this {
    this.charts.push({ type: 'scatter', ...config });
    return this;
  }

  /** 热力图 */
  heatmap(config: Omit<HeatmapChart, 'type'>): this {
    this.charts.push({ type: 'heatmap', ...config });
    return this;
  }

  /** 瀑布图 */
  waterfall(config: Omit<WaterfallChart, 'type'>): this {
    this.charts.push({ type: 'waterfall', ...config });
    return this;
  }

  /** 环形图 */
  donut(config: Omit<DonutChart, 'type'>): this {
    this.charts.push({ type: 'donut', ...config });
    return this;
  }

  /** 雷达图 */
  radar(config: Omit<RadarChart, 'type'>): this {
    this.charts.push({ type: 'radar', ...config });
    return this;
  }

  /** 仪表盘 */
  gauge(config: Omit<GaugeChart, 'type'>): this {
    this.charts.push({ type: 'gauge', ...config });
    return this;
  }

  /** 斜率图 */
  slope(config: Omit<SlopeChart, 'type'>): this {
    this.charts.push({ type: 'slope', ...config });
    return this;
  }

  /** 金字塔图 */
  pyramid(config: Omit<PyramidChart, 'type'>): this {
    this.charts.push({ type: 'pyramid', ...config });
    return this;
  }

  /** 渲染为 SVG 字符串 */
  render(): string {
    const chart = this.charts[0];
    if (!chart) {
      return this.wrapSvg('');
    }

    // 标题留白
    const titleH = this.title ? 40 : 0;
    const chartH = this.height - titleH;
    // Keep the single-chart markup unchanged. Multiple charts get independent
    // viewports and domains, in the order they were added.
    const chartSvg = this.charts.length === 1
      ? renderChart(chart, this.width, chartH, this.theme)
      : this.renderPanels(chartH);

    const titleElem = this.title
      ? h('text', {
        x: this.width / 2,
        y: 28,
        'text-anchor': 'middle',
        'font-size': 18,
        'font-weight': 700,
        fill: this.theme?.tokens['--ink'] ?? '#051C2C',
      }, esc(this.title))
      : '';

    return this.wrapSvg(join(titleElem, h('g', { transform: `translate(0, ${titleH})` }, chartSvg)));
  }

  private renderPanels(height: number): Html {
    const count = this.charts.length;
    const columns = Math.min(this.columns ?? Math.ceil(Math.sqrt(count)), count);
    const rows = Math.ceil(count / columns);
    const panelWidth = (this.width - this.gap * (columns - 1)) / columns;
    const panelHeight = (height - this.gap * (rows - 1)) / rows;
    if (!Number.isFinite(panelWidth) || !Number.isFinite(panelHeight) ||
        panelWidth < 160 || panelHeight < 120) {
      throw new RangeError(
        'SVG grid panels must be at least 160 × 120 pixels; increase the figure size or reduce columns/gap',
      );
    }
    return join(...this.charts.map((chart, index) => {
      const x = (index % columns) * (panelWidth + this.gap);
      const y = Math.floor(index / columns) * (panelHeight + this.gap);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new RangeError('SVG grid panel positions must be finite; reduce the figure size or gap');
      }
      return h('g', {
        'data-panel-index': index,
        'data-chart-type': chart.type,
        transform: `translate(${x}, ${y})`,
      }, renderChart(chart, panelWidth, panelHeight, this.theme));
    }));
  }

  /** 渲染为完整的 HTML 页面（带样式和动画） */
  renderHtml(): string {
    const styles = generateStyles(this.theme ? { ink: this.theme.tokens['--ink'], accent: this.theme.tokens['--accent'], paper: this.theme.tokens['--paper'], neutral: this.theme.tokens['--grid'] } : palette(this.accent));
    // generateStyles returns a complete <style> element. This document already
    // has a stylesheet, so insert only its rules for every palette.
    const inlineStyles = styles.slice('<style>'.length, -'</style>'.length);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(this.title || 'plot-ts Chart')}</title>
  <style>
    body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: ${this.theme?.tokens['--paper'] ?? '#f5f5f7'}; }
    .chart-container { background: ${this.theme?.tokens['--paper'] ?? 'white'}; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); padding: 20px; }
    ${inlineStyles}
  </style>
</head>
<body>
  <div class="chart-container">
    ${this.render()}
  </div>
</body>
</html>`;
  }

  private wrapSvg(content: Html): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  ${this.theme ? h('rect', { width: this.width, height: this.height, fill: this.theme.tokens['--paper'], 'data-plot-surface': 'paper' }) : ''}${content}
</svg>`;
  }
}

/** Dispatch each panel through the same renderer used by single-chart figures. */
function renderChart(chart: Chart, width: number, height: number, theme?: CanonicalTheme): Html {
  switch (chart.type) {
    case 'column': return renderColumn(chart, width, height, theme);
    case 'line': return renderLine(chart, width, height, theme);
    case 'scatter': return renderScatter(chart, width, height, theme);
    case 'heatmap': return renderHeatmap(chart, width, height, theme);
    case 'waterfall': return renderWaterfall(chart, width, height, theme);
    case 'donut': return renderDonut(chart, width, height, theme);
    case 'radar': return renderRadar(chart, width, height, theme);
    case 'gauge': return renderGauge(chart, width, height, theme);
    case 'slope': return renderSlope(chart, width, height, theme);
    case 'pyramid': return renderPyramid(chart, width, height, theme);
  }
}

/**
 * 创建一个新的 SVG 图表对象（Matplotlib 风格）。
 *
 * ```typescript
 * import { figure } from 'plot-ts/svg';
 *
 * figure({ width: 600, height: 400, title: '销售数据' })
 *   .bar({
 *     categories: ['Q1', 'Q2', 'Q3', 'Q4'],
 *     series: [{ values: [120, 150, 180, 210] }]
 *   })
 *   .render(); // 返回 SVG 字符串
 * ```
 */
export function figure(options?: SvgFigureOptions): SvgFigure {
  return new SvgFigure(options);
}

// 导出类型
export type {
  ColumnChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  WaterfallChart,
  DonutChart,
  RadarChart,
  GaugeChart,
  SlopeChart,
  PyramidChart,
};

