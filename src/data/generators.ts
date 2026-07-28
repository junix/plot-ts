// Deterministic data generators for consistent demo outputs

// Seeded random number generator (Mulberry32)
export function createRandom(seed: number = 42) {
  return function random(): number {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export interface Point {
  x: number
  y: number
}

export interface Point3D extends Point {
  z: number
}

// Linear data with noise
export function linearData(
  n: number = 50,
  slope: number = 1,
  intercept: number = 0,
  noise: number = 0.1,
  seed: number = 42
): Point[] {
  const rand = createRandom(seed)
  return Array.from({ length: n }, (_, i) => ({
    x: i / n * 10,
    y: slope * (i / n * 10) + intercept + (rand() - 0.5) * noise,
  }))
}

// Normal distribution sample
export function normalData(n: number = 100, mean: number = 0, std: number = 1, seed: number = 42): number[] {
  const rand = createRandom(seed)
  const result: number[] = []

  // Box-Muller transform
  for (let i = 0; i < n; i += 2) {
    const u1 = rand()
    const u2 = rand()
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2)
    result.push(mean + z0 * std)
    if (i + 1 < n) result.push(mean + z1 * std)
  }

  return result
}

// Multiple groups for ridge plots
export interface GroupData {
  group: string
  values: number[]
}

export function ridgeData(groups: string[] = ['A', 'B', 'C', 'D', 'E'], n: number = 200, seed: number = 42): GroupData[] {
  const rand = createRandom(seed)
  return groups.map((group, i) => ({
    group,
    values: normalData(n, i * 2, 0.5 + rand() * 0.3, seed + i),
  }))
}

// Time series data
export interface TimeSeriesPoint {
  date: Date
  value: number
}

export function timeSeriesData(days: number = 365, seed: number = 42): TimeSeriesPoint[] {
  const rand = createRandom(seed)
  const start = new Date('2024-01-01')
  let value = 100

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    value += (rand() - 0.48) * 3
    return { date, value: Math.max(0, value) }
  })
}

// Heatmap 2D data
export interface HeatmapCell {
  row: number
  col: number
  value: number
}

export function heatmapData(rows: number = 10, cols: number = 10, seed: number = 42): HeatmapCell[] {
  const rand = createRandom(seed)
  const data: HeatmapCell[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Create a gradient pattern
      const base = (r + c) / (rows + cols)
      const noise = (rand() - 0.5) * 0.3
      data.push({ row: r, col: c, value: Math.max(0, Math.min(1, base + noise)) })
    }
  }

  return data
}

// 3D surface data (Lorenz attractor)
export function lorenzAttractor(
  steps: number = 5000,
  sigma: number = 10,
  rho: number = 28,
  beta: number = 8 / 3,
  dt: number = 0.01,
  seed: number = 42
): Point3D[] {
  const rand = createRandom(seed)
  let x = rand() * 2 - 1
  let y = rand() * 2 - 1
  let z = rand() * 20 + 10

  const points: Point3D[] = []

  for (let i = 0; i < steps; i++) {
    const dx = sigma * (y - x) * dt
    const dy = (x * (rho - z) - y) * dt
    const dz = (x * y - beta * z) * dt

    x += dx
    y += dy
    z += dz

    points.push({ x, y, z })
  }

  return points
}

// Financial OHLC data
export interface OHLC {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function ohlcData(days: number = 100, seed: number = 42): OHLC[] {
  const rand = createRandom(seed)
  let price = 100
  const start = new Date('2024-01-01')
  const result: OHLC[] = []

  for (let i = 0; i < days; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)

    const volatility = (rand() - 0.45) * 4
    const open = price
    const dayChange = volatility
    const high = open + Math.abs(dayChange) + rand() * 2
    const low = open - Math.abs(dayChange) - rand() * 2
    const close = open + dayChange
    const volume = 100000 + rand() * 500000

    result.push({ date, open, high, low, close, volume })
    price = close
  }

  return result
}

// Bifurcation diagram data
export interface BifurcationPoint {
  r: number
  x: number
}

export function bifurcationData(
  rStart: number = 2.5,
  rEnd: number = 4,
  rSteps: number = 1000,
  skip: number = 100,
  collect: number = 100
): BifurcationPoint[] {
  const points: BifurcationPoint[] = []

  for (let i = 0; i < rSteps; i++) {
    const r = rStart + (rEnd - rStart) * (i / rSteps)
    let x = 0.5

    // Skip transient
    for (let j = 0; j < skip; j++) {
      x = r * x * (1 - x)
    }

    // Collect points
    for (let j = 0; j < collect; j++) {
      x = r * x * (1 - x)
      points.push({ r, x })
    }
  }

  return points
}

// Sankey/flow data
export interface FlowNode {
  id: string
  label: string
}

export interface FlowLink {
  source: string
  target: string
  value: number
}

export interface FlowData {
  nodes: FlowNode[]
  links: FlowLink[]
}

export function flowData(seed: number = 42): FlowData {
  const rand = createRandom(seed)

  const nodes: FlowNode[] = [
    { id: 'a', label: 'Source A' },
    { id: 'b', label: 'Source B' },
    { id: 'c', label: 'Source C' },
    { id: 'x', label: 'Process X' },
    { id: 'y', label: 'Process Y' },
    { id: 'p', label: 'Product P' },
    { id: 'q', label: 'Product Q' },
  ]

  const links: FlowLink[] = [
    { source: 'a', target: 'x', value: 50 + rand() * 30 },
    { source: 'a', target: 'y', value: 30 + rand() * 20 },
    { source: 'b', target: 'x', value: 40 + rand() * 20 },
    { source: 'b', target: 'y', value: 60 + rand() * 30 },
    { source: 'c', target: 'y', value: 70 + rand() * 20 },
    { source: 'x', target: 'p', value: 60 + rand() * 30 },
    { source: 'x', target: 'q', value: 30 + rand() * 20 },
    { source: 'y', target: 'p', value: 40 + rand() * 20 },
    { source: 'y', target: 'q', value: 120 + rand() * 40 },
  ]

  return { nodes, links }
}

// Correlation matrix
export function correlationMatrix(vars: number = 8, seed: number = 42): number[][] {
  const rand = createRandom(seed)
  const matrix: number[][] = Array.from({ length: vars }, () => Array(vars).fill(0))

  for (let i = 0; i < vars; i++) {
    for (let j = 0; j < vars; j++) {
      if (i === j) {
        matrix[i]![j] = 1
      } else if (j < i) {
        matrix[i]![j] = matrix[j]![i]!
      } else {
        // Create plausible correlations
        const baseCorr = (vars - Math.abs(i - j)) / vars
        const noise = (rand() - 0.5) * 0.4
        matrix[i]![j] = Math.max(-1, Math.min(1, baseCorr + noise))
      }
    }
  }

  return matrix
}
