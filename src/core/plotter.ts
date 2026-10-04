// plot-ts Browser Renderer - ECharts powered with Matplotlib-style API
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import { COLORS } from '../style/palette.js'
import { findCanonicalTheme, canonicalEChartsTheme, type CanonicalTheme } from '../style/canonical.js'

export interface FigureConfig {
  width?: number | string
  height?: number | string
  title?: string
  /** Canonical names opt in; other strings are passed unchanged to ECharts. */
  theme?: string
  animated?: boolean
  animationDuration?: number
}

export interface LineConfig {
  color?: string
  width?: number
  dash?: number[]
  opacity?: number
  smooth?: boolean
  animation?: boolean
}

export interface ScatterConfig {
  color?: string
  size?: number
  opacity?: number
  symbol?: 'circle' | 'square' | 'triangle' | 'diamond'
}

export interface BarConfig {
  color?: string
  opacity?: number
  borderRadius?: number
  stack?: string
}

export interface AreaConfig {
  color?: string
  opacity?: number
  smooth?: boolean
  stack?: boolean
  fill?: boolean
}

export interface HeatmapConfig {
  colormap?: 'viridis' | 'plasma' | 'blues' | 'rdbu' | 'heat'
  showValues?: boolean
}

export interface AxisConfig {
  label?: string
  min?: number
  max?: number
  log?: boolean
  grid?: boolean
}

type HeatmapColormap = NonNullable<HeatmapConfig['colormap']>

function resolveHeatmapColormap(colormap: HeatmapConfig['colormap']): HeatmapColormap {
  switch (colormap) {
    case undefined: return 'viridis'
    case 'viridis': case 'plasma': case 'blues': case 'rdbu': case 'heat': return colormap
    default: throw new RangeError('Unsupported heatmap colormap. Use viridis, plasma, blues, rdbu, or heat.')
  }
}

// Nonempty labels are partial annotations, as in the SVG heatmap. Keep one
// category per matrix column/row; missing annotations are blank and extras ignored.
function heatmapLabels(labels: string[], count: number): string[] {
  if (!Array.isArray(labels)) {
    throw new RangeError('Heatmap labels must be strings')
  }
  // Iteration checks holes as well as explicitly supplied entries.
  for (const label of labels) {
    if (typeof label !== 'string') throw new RangeError('Heatmap labels must be strings')
  }
  return Array.from({ length: count }, (_, i) => labels.length ? (labels[i] ?? '') : String(i))
}

// A single visualMap is shared by all heatmaps, so its domain must include all
// their cells. Iteration avoids the argument-count limit of Math.min(...values).
function heatmapDomain(series: { data: [number, number, number][] }[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const heatmap of series) {
    for (const [, , value] of heatmap.data) {
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (min === Infinity) return [0, 1]
  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.01)
    // At finite extremes use a one-sided interval instead of an infinite bound.
    const lower = min - padding
    const upper = max + padding
    return [Number.isFinite(lower) ? lower : min, Number.isFinite(upper) ? upper : max]
  }
  return [min, max]
}

function validateMaxPoints(maxPoints: number): void {
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError('maxPoints must be a positive safe integer')
  }
}

export class Figure {
  private dom: HTMLElement
  private chart: ECharts
  private config: FigureConfig
  private canonicalTheme: CanonicalTheme | undefined
  private series: any[] = []
  private heatmapColormap: HeatmapColormap | undefined
  private xAxisConfig: any = {}
  private yAxisConfig: any = {}
  private titleText: string = ''
  private gridConfig: any = {}
  private disposed = false
  private streamStops = new Set<() => void>()
  private handleResize = () => {
    if (!this.disposed) this.chart.resize()
  }

  constructor(container: HTMLElement, config: FigureConfig = {}) {
    this.dom = container
    this.config = {
      width: 800,
      height: 500,
      animated: true,
      animationDuration: 1000,
      ...config
    }

    // Set container size
    if (typeof this.config.width === 'number') {
      this.dom.style.width = `${this.config.width}px`
    } else if (this.config.width) {
      this.dom.style.width = this.config.width
    }
    if (typeof this.config.height === 'number') {
      this.dom.style.height = `${this.config.height}px`
    } else if (this.config.height) {
      this.dom.style.height = this.config.height
    }

    // Initialize ECharts
    this.canonicalTheme = findCanonicalTheme(config.theme)
    this.chart = echarts.init(this.dom, this.canonicalTheme ? canonicalEChartsTheme(this.canonicalTheme) : config.theme)
    this.titleText = config.title || ''

    // Handle resize
    window.addEventListener('resize', this.handleResize)
  }

  // Set title
  title(text: string): this {
    this.titleText = text
    return this
  }

  // Configure X axis
  xAxis(config: AxisConfig): this {
    this.configureAxis(this.xAxisConfig, config)
    return this
  }

  // Configure Y axis
  yAxis(config: AxisConfig): this {
    this.configureAxis(this.yAxisConfig, config)
    return this
  }

  // Axis calls are partial updates: omitted fields keep their previous values.
  private configureAxis(axis: any, config: AxisConfig): void {
    if (config.label !== undefined) axis.name = config.label
    if (config.min !== undefined) axis.min = config.min
    if (config.max !== undefined) axis.max = config.max
    if (config.log !== undefined) axis.type = config.log ? 'log' : 'value'
    if (config.grid !== undefined) axis.splitLine = { show: config.grid }
  }

  // Enable grid
  grid(show: boolean = true): this {
    this.gridConfig = show
    return this
  }

  private seriesColor(index: number): string | undefined {
    const colors = this.canonicalTheme?.series ?? COLORS.tableau
    return colors[index % colors.length]
  }

  // Plot line chart
  plot(
    xData: number[],
    yData: number[],
    config: LineConfig & { name?: string } = {}
  ): this {
    const data = xData.map((x, i) => [x, yData[i]])
    const color = config.color || this.seriesColor(this.series.length)

    this.series.push({
      id: `plot-ts-series-${this.series.length}`,
      name: config.name || `Series ${this.series.length + 1}`,
      type: 'line',
      data,
      smooth: config.smooth ?? true,
      lineStyle: {
        color,
        width: config.width || 2,
        type: config.dash ? 'dashed' : 'solid',
        opacity: config.opacity || 1
      },
      itemStyle: { color },
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
      animationEasing: 'cubicOut'
    })

    return this
  }

  // Scatter plot
  scatter(
    xData: number[],
    yData: number[],
    config: ScatterConfig & { name?: string } = {}
  ): this {
    const data = xData.map((x, i) => [x, yData[i]])
    const color = config.color || this.seriesColor(this.series.length)

    const symbolMap: Record<string, string> = {
      circle: 'circle', square: 'rect', triangle: 'triangle', diamond: 'diamond'
    }

    this.series.push({
      id: `plot-ts-series-${this.series.length}`,
      name: config.name || `Series ${this.series.length + 1}`,
      type: 'scatter',
      data,
      symbol: symbolMap[config.symbol || 'circle'],
      symbolSize: config.size || 8,
      itemStyle: {
        color,
        opacity: config.opacity || 0.8
      },
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
      animationEasing: 'elasticOut'
    })

    return this
  }

  // Bar chart
  bar(
    categories: (string | number)[],
    values: number[],
    config: BarConfig & { name?: string } = {}
  ): this {
    const color = config.color || this.seriesColor(this.series.length)

    this.series.push({
      id: `plot-ts-series-${this.series.length}`,
      name: config.name || `Series ${this.series.length + 1}`,
      type: 'bar',
      data: values,
      itemStyle: {
        color,
        opacity: config.opacity || 1,
        borderRadius: config.borderRadius || [4, 4, 0, 0]
      },
      stack: config.stack,
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
      animationEasing: 'cubicOut',
      animationDelay: (idx: number) => idx * 50
    })

    // For bar chart, x axis is category
    this.xAxisConfig.type = 'category'
    this.xAxisConfig.data = categories.map(String)

    return this
  }

  // Heatmap: finite rectangular rows; [] and zero-column matrices are allowed.
  heatmap(
    data: number[][],
    xLabels: string[] = [],
    yLabels: string[] = [],
    config: HeatmapConfig = {}
  ): this {
    // One visualMap is shared by all heatmaps. Later omissions inherit its palette.
    const colormap = resolveHeatmapColormap(config.colormap === undefined ? this.heatmapColormap : config.colormap)
    if (this.heatmapColormap !== undefined && colormap !== this.heatmapColormap) {
      throw new RangeError('Heatmaps in one Figure must use the same colormap.')
    }

    // Validate and snapshot all inputs before changing the figure's series/axes.
    if (!Array.isArray(data)) throw new RangeError('Heatmap data must be rectangular')
    const columns = data[0]?.length ?? 0
    const heatmapData: [number, number, number][] = []
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!Array.isArray(row) || row.length !== columns) {
        throw new RangeError('Heatmap data must be rectangular')
      }
      for (let j = 0; j < columns; j++) {
        const value = row[j]!
        if (!Number.isFinite(value)) throw new RangeError('Heatmap values must be finite')
        heatmapData.push([j, i, value])
      }
    }
    const columnLabels = heatmapLabels(xLabels, columns)
    const rowLabels = heatmapLabels(yLabels, data.length)

    this.series.push({
      id: `plot-ts-series-${this.series.length}`,
      type: 'heatmap',
      data: heatmapData,
      label: config.showValues ? { show: true, fontSize: 10 } : undefined,
      itemStyle: { borderWidth: 1 },
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
    })
    this.heatmapColormap = colormap

    this.xAxisConfig.type = 'category'
    this.xAxisConfig.data = columnLabels
    this.yAxisConfig.type = 'category'
    this.yAxisConfig.data = rowLabels

    return this
  }

  // Add violin plot
  violin(
    groups: string[],
    distributions: number[][],
    config: { color?: string } = {}
  ): this {
    // Convert distributions to violin format
    const seriesData: any[] = []

    for (let i = 0; i < groups.length; i++) {
      const data = distributions[i]
      if (!data) continue

      seriesData.push({
        name: groups[i],
        value: data,
        itemStyle: {
          color: config.color || this.seriesColor(i)
        }
      })
    }

    this.series.push({
      id: `plot-ts-series-${this.series.length}`,
      type: 'custom',
      renderItem: (params: any, api: any) => {
        // Simple violin rendering using boxplot-like shape
        const points = params.data.value as number[]
        const sorted = [...points].sort((a, b) => a - b)
        const q1 = sorted[Math.floor(sorted.length * 0.25)]!
        const median = sorted[Math.floor(sorted.length * 0.5)]!
        const q3 = sorted[Math.floor(sorted.length * 0.75)]!

        const coord = api.coord([params.dataIndex, 0])
        const x = Array.isArray(coord) ? coord[0] : 0
        const width = 40

        const y1 = api.coord([0, q1])[1]
        const ym = api.coord([0, median])[1]
        const y3 = api.coord([0, q3])[1]

        return {
          type: 'group',
          children: [{
            type: 'path',
            shape: {
              pathData: `M${x - width/2},${y1}Q${x - width},${ym} ${x - width/2},${y3}L${x + width/2},${y3}Q${x + width},${ym} ${x + width/2},${y1}Z`
            },
            style: {
              fill: params.itemStyle.color,
              stroke: this.canonicalTheme?.tokens['--line'] ?? '#333',
              lineWidth: 1
            }
          }]
        }
      },
      data: seriesData,
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
    })

    this.xAxisConfig.type = 'category'
    this.xAxisConfig.data = groups

    return this
  }

  // Area chart
  area(
    xData: number[],
    yData: number[],
    config: AreaConfig & { name?: string } = {}
  ): this {
    const data = xData.map((x, i) => [x, yData[i]])
    const color = config.color || this.seriesColor(this.series.length)

    this.series.push({
      id: `plot-ts-series-${this.series.length}`,
      name: config.name || `Series ${this.series.length + 1}`,
      type: 'line',
      data,
      smooth: config.smooth ?? true,
      areaStyle: config.fill !== false ? {
        color,
        opacity: config.opacity || 0.3
      } : undefined,
      lineStyle: {
        color,
        width: 2
      },
      itemStyle: { color },
      stack: config.stack ? 'area-stack' : undefined,
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
      animationEasing: 'cubicOut'
    })

    return this
  }

  // Export chart as image
  exportImage(type: 'png' | 'jpeg' = 'png'): string {
    return this.chart.getDataURL({
      type,
      pixelRatio: 2,
      backgroundColor: this.canonicalTheme?.tokens['--paper'] ?? '#fff'
    })
  }

  // Download chart as file
  download(filename: string = 'chart.png', type: 'png' | 'jpeg' = 'png'): void {
    const dataUrl = this.exportImage(type)
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
  }

  // Get the ECharts instance for direct manipulation
  getRawChart(): ECharts {
    return this.chart
  }

  // Append new data point (for streaming data) with smooth animation
  appendPoint(x: number, y: number, seriesIndex: number = 0, maxPoints: number = 50): void {
    if (this.series[seriesIndex]) {
      validateMaxPoints(maxPoints)
      const series = this.series[seriesIndex]
      series.data.push([x, y])

      // Keep the newest points even when the initial data exceeds the bound.
      if (series.data.length > maxPoints) {
        series.data.splice(0, series.data.length - maxPoints)
      }

      // Match by stable ID: an anonymous one-item patch would target series 0.
      this.chart.setOption({
        series: [{
          id: series.id,
          data: series.data
        }]
      })
    }
  }

  // Stream data continuously
  stream(
    generator: () => { x: number; y: number },
    interval: number = 500,
    maxPoints: number = 50,
    seriesIndex: number = 0
  ): () => void {
    // A disposed figure cannot acquire new background work.
    if (this.disposed) return () => {}
    // Fail synchronously rather than throwing on each scheduled tick.
    validateMaxPoints(maxPoints)

    let active = true
    const timer = setInterval(() => {
      if (!active || this.disposed) return
      const { x, y } = generator()
      // The generator may stop this stream or dispose the figure itself.
      if (active && !this.disposed) this.appendPoint(x, y, seriesIndex, maxPoints)
    }, interval)

    const stop = () => {
      if (!active) return
      active = false
      clearInterval(timer)
      this.streamStops.delete(stop)
    }
    this.streamStops.add(stop)
    return stop
  }

  // Render the chart
  render(): void {
    const option: EChartsOption = {
      title: {
        text: this.titleText,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: this.series[0]?.type === 'heatmap' ? 'item' : 'axis',
        axisPointer: {
          type: this.series[0]?.type === 'scatter' ? 'cross' : 'line'
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: this.titleText ? '15%' : '10%',
        show: this.gridConfig
      },
      xAxis: {
        type: this.xAxisConfig.type || 'value',
        name: this.xAxisConfig.name,
        min: this.xAxisConfig.min,
        max: this.xAxisConfig.max,
        splitLine: this.xAxisConfig.splitLine,
        data: this.xAxisConfig.data,
        axisLabel: {
          fontSize: 11
        }
      },
      yAxis: {
        type: this.yAxisConfig.type || 'value',
        name: this.yAxisConfig.name,
        min: this.yAxisConfig.min,
        max: this.yAxisConfig.max,
        splitLine: this.yAxisConfig.splitLine,
        data: this.yAxisConfig.data,
        axisLabel: {
          fontSize: 11
        }
      },
      series: this.series as any,
      animation: this.config.animated ?? true,
    }

    // Add legend if multiple series
    if (this.series.length > 1) {
      option.legend = {
        data: this.series.map(s => s.name),
        bottom: 10
      }
    }

    // Add visualMap for heatmap
    const heatmaps = this.series.filter(s => s.type === 'heatmap')
    if (heatmaps.length) {
      const [min, max] = heatmapDomain(heatmaps)
      option.visualMap = {
        // Never apply a heatmap palette to a line, scatter, or other series.
        seriesIndex: this.series.flatMap((series, index) => series.type === 'heatmap' ? [index] : []),
        dimension: 2,
        min,
        max,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: [...COLORS[this.heatmapColormap ?? 'viridis']]
        }
      }
    }

    this.chart.setOption(option)
  }

  // Update data with animation
  update(): void {
    this.render()
  }

  // Resize chart
  resize(): void {
    this.chart.resize()
  }

  // Dispose
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('resize', this.handleResize)
    for (const stop of this.streamStops) stop()
    this.chart.dispose()
  }

  // Get underlying ECharts instance
  getECharts(): ECharts {
    return this.chart
  }
}

// Convenience factory function
export function figure(container: HTMLElement, config?: FigureConfig): Figure {
  return new Figure(container, config)
}

// Example usage:
// const fig = figure(document.getElementById('chart')!, { title: 'My Chart', animated: true })
// fig.plot([1, 2, 3, 4], [10, 20, 15, 25], { name: 'Line 1' })
// fig.scatter([1, 2, 3, 4], [8, 22, 12, 28], { name: 'Points' })
// fig.xAxis({ label: 'X Axis' })
// fig.yAxis({ label: 'Y Axis' })
// fig.grid()
// fig.render()
