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

import type { Html } from '../util/html.js';
import { h, join } from '../util/html.js';
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
  width?: number;
  height?: number;
  title?: string;
  accent?: AccentName;
  animated?: boolean;
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
  private charts: Chart[] = [];

  constructor(options: SvgFigureOptions = {}) {
    this.width = options.width ?? 800;
    this.height = options.height ?? 500;
    this.title = options.title;
    this.accent = options.accent ?? 'cyan';
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
    // 简单布局：如果只有一张图，占满整个画布
    // 多张图时采用简单的网格布局（TODO）
    const chart = this.charts[0];
    if (!chart) {
      return this.wrapSvg('');
    }

    // 标题留白
    const titleH = this.title ? 40 : 0;
    const chartW = this.width;
    const chartH = this.height - titleH;

    let chartSvg = '';
    switch (chart.type) {
      case 'column':
        chartSvg = renderColumn(chart, chartW, chartH);
        break;
      case 'line':
        chartSvg = renderLine(chart, chartW, chartH);
        break;
      case 'scatter':
        chartSvg = renderScatter(chart, chartW, chartH);
        break;
      case 'heatmap':
        chartSvg = renderHeatmap(chart, chartW, chartH);
        break;
      case 'waterfall':
        chartSvg = renderWaterfall(chart, chartW, chartH);
        break;
      case 'donut':
        chartSvg = renderDonut(chart, chartW, chartH);
        break;
      case 'radar':
        chartSvg = renderRadar(chart, chartW, chartH);
        break;
      case 'gauge':
        chartSvg = renderGauge(chart, chartW, chartH);
        break;
      case 'slope':
        chartSvg = renderSlope(chart, chartW, chartH);
        break;
      case 'pyramid':
        chartSvg = renderPyramid(chart, chartW, chartH);
        break;
    }

    const titleElem = this.title
      ? h('text', {
        x: this.width / 2,
        y: 28,
        'text-anchor': 'middle',
        'font-size': 18,
        'font-weight': 700,
        fill: '#051C2C',
      }, this.title)
      : '';

    return this.wrapSvg(join(titleElem, h('g', { transform: `translate(0, ${titleH})` }, chartSvg)));
  }

  /** 渲染为完整的 HTML 页面（带样式和动画） */
  renderHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${this.title || 'plot-ts Chart'}</title>
  <style>
    body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f7; }
    .chart-container { background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); padding: 20px; }
    ${generateStyles(palette(this.accent))}
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
  ${content}
</svg>`;
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
