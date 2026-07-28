// Core types for the plotting library

export type AxisScale = 'linear' | 'log' | 'sqrt' | 'time' | 'ordinal'

export type ColorScale = 'viridis' | 'plasma' | 'blues' | 'rdbu' | 'tableau' | 'gray'

export type Orientation = 'horizontal' | 'vertical'

export interface FigureConfig {
  width?: number
  height?: number
  title?: string
  theme?: string
  dpi?: number
}

export interface AxisConfig {
  label?: string
  scale?: AxisScale
  limits?: [number, number]
  ticks?: number[]
  tickLabels?: string[]
  grid?: boolean
  invert?: boolean
}

export interface LegendConfig {
  position?: 'top' | 'bottom' | 'left' | 'right' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  title?: string
  visible?: boolean
}

export interface ColorConfig {
  palette?: string[]
  scale?: ColorScale
  reverse?: boolean
  limits?: [number, number]
}

export interface LineStyle {
  width?: number
  dash?: number[]
  opacity?: number
}

export interface MarkerStyle {
  symbol?: 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'plus'
  size?: number
  opacity?: number
  edgeColor?: string
  edgeWidth?: number
}

export interface TextStyle {
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
}

export interface Annotation {
  x: number | string
  y: number | string
  text: string
  style?: TextStyle
  arrow?: {
    visible: boolean
    color?: string
    width?: number
    headSize?: number
  }
}

// Demo registry
export interface Demo {
  id: string
  name: string
  category: string
  description: string
  render: (outputPath: string) => Promise<void>
}

const demos: Map<string, Demo> = new Map()
const categories: Map<string, Demo[]> = new Map()

export function registerDemo(demo: Demo): void {
  demos.set(demo.id, demo)

  if (!categories.has(demo.category)) {
    categories.set(demo.category, [])
  }
  categories.get(demo.category)!.push(demo)
}

export function getDemo(id: string): Demo | undefined {
  return demos.get(id)
}

export function listDemos(): Demo[] {
  return Array.from(demos.values())
}

export function listCategories(): string[] {
  return Array.from(categories.keys())
}

export function getDemosByCategory(category: string): Demo[] {
  return categories.get(category) || []
}
