// plot-ts - Universal TypeScript plotting library
// Dual engines: ECharts (browser/interactive) + Pure SVG (server/reports)

// ========== 浏览器端 ECharts 引擎 (默认) ==========
export { Figure, type FigureConfig, type LineConfig, type ScatterConfig, type BarConfig, type HeatmapConfig, type AreaConfig, type AxisConfig } from './core/plotter.js'

// ========== 纯 SVG 引擎 (服务端/无头渲染) ==========
export * as svg from './svg/index.js'

// ========== 样式与配色 ==========
export { COLORS, THEMES, getTheme, setTheme, withTheme } from './style/palette.js'

// ========== 设计令牌 (专业风格) ==========
export {
  palette,
  INK,
  PAPER,
  NEUTRAL,
  INK_ALPHA,
  ACCENTS,
  type AccentName,
  type Palette,
  CANVAS,
  FRAME,
  TYPE,
  FONTS,
  MOTION,
  generateStyles,
} from './style/tokens.js'

// ========== 工具函数 ==========
export * as util from './util/scale.js'
export * as html from './util/html.js'

// ========== 数据生成器 ==========
export * from './data/generators.js'

// ========== 便捷工厂函数 (浏览器端) ==========
import { Figure } from './core/plotter.js'
import type { FigureConfig } from './core/plotter.js'

export function figure(container: HTMLElement, config?: FigureConfig): Figure {
  return new Figure(container, config)
}

console.log('plot-ts loaded - Dual-engine plotting library')
