// plot-ts Browser Renderer - ECharts powered with Matplotlib-style API
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import { COLORS } from '../style/palette.js'

export interface FigureConfig {
  width?: number | string
  height?: number | string
  title?: string
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

export class Figure {
  private dom: HTMLElement
  private chart: ECharts
  private config: FigureConfig
  private series: any[] = []
  private xAxisConfig: any = {}
  private yAxisConfig: any = {}
  private titleText: string = ''
  private gridConfig: any = {}

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
    this.chart = echarts.init(this.dom, config.theme)
    this.titleText = config.title || ''

    // Handle resize
    window.addEventListener('resize', () => {
      this.chart.resize()
    })
  }

  // Set title
  title(text: string): this {
    this.titleText = text
    return this
  }

  // Configure X axis
  xAxis(config: AxisConfig): this {
    this.xAxisConfig = {
      name: config.label,
      min: config.min,
      max: config.max,
      type: config.log ? 'log' : 'value',
      ...this.xAxisConfig
    }
    return this
  }

  // Configure Y axis
  yAxis(config: AxisConfig): this {
    this.yAxisConfig = {
      name: config.label,
      min: config.min,
      max: config.max,
      type: config.log ? 'log' : 'value',
      ...this.yAxisConfig
    }
    return this
  }

  // Enable grid
  grid(show: boolean = true): this {
    this.gridConfig = show
    return this
  }

  // Plot line chart
  plot(
    xData: number[],
    yData: number[],
    config: LineConfig & { name?: string } = {}
  ): this {
    const data = xData.map((x, i) => [x, yData[i]])
    const color = config.color || COLORS.tableau[this.series.length % COLORS.tableau.length]

    this.series.push({
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
    const color = config.color || COLORS.tableau[this.series.length % COLORS.tableau.length]

    const symbolMap: Record<string, string> = {
      circle: 'circle', square: 'rect', triangle: 'triangle', diamond: 'diamond'
    }

    this.series.push({
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
    const color = config.color || COLORS.tableau[this.series.length % COLORS.tableau.length]

    this.series.push({
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

  // Heatmap
  heatmap(
    data: number[][],
    xLabels: string[] = [],
    yLabels: string[] = [],
    config: HeatmapConfig = {}
  ): this {
    // Convert matrix to ECharts heatmap format
    const heatmapData: any[] = []
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i]!.length; j++) {
        heatmapData.push([j, i, data[i]![j]])
      }
    }

    // Colormap configuration

    this.series.push({
      type: 'heatmap',
      data: heatmapData,
      label: config.showValues ? { show: true, fontSize: 10 } : undefined,
      itemStyle: { borderWidth: 1 },
      animationDuration: this.config.animated ? this.config.animationDuration : 0,
    })

    this.xAxisConfig.type = 'category'
    this.xAxisConfig.data = xLabels.length ? xLabels : Array.from({ length: data[0]?.length || 0 }, (_, i) => String(i))
    this.yAxisConfig.type = 'category'
    this.yAxisConfig.data = yLabels.length ? yLabels : Array.from({ length: data.length }, (_, i) => String(i))

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
          color: config.color || COLORS.tableau[i % COLORS.tableau.length]
        }
      })
    }

    this.series.push({
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
              stroke: '#333',
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
    const color = config.color || COLORS.tableau[this.series.length % COLORS.tableau.length]

    this.series.push({
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
      backgroundColor: '#fff'
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
      const series = this.series[seriesIndex]
      series.data.push([x, y])

      // Trim data if exceeding max points
      if (series.data.length > maxPoints) {
        series.data.shift()
      }

      // Update only the data without full redraw
      this.chart.setOption({
        series: [{
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
    const timer = setInterval(() => {
      const { x, y } = generator()
      this.appendPoint(x, y, seriesIndex, maxPoints)
    }, interval)

    // Return stop function
    return () => clearInterval(timer)
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
        data: this.xAxisConfig.data,
        axisLabel: {
          fontSize: 11
        }
      },
      yAxis: {
        type: this.yAxisConfig.type || 'value',
        name: this.yAxisConfig.name,
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
    if (this.series.some(s => s.type === 'heatmap')) {
      option.visualMap = {
        min: Math.min(...this.series.filter(s => s.type === 'heatmap')[0].data.map((d: [number, number, number]) => d[2])),
        max: Math.max(...this.series.filter(s => s.type === 'heatmap')[0].data.map((d: [number, number, number]) => d[2])),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: COLORS.viridis
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
