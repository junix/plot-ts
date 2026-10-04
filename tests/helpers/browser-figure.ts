import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { color as echartsColor } from 'echarts'
import type { Figure } from '../../src/core/plotter.js'

// These tests inspect the options and lifecycle calls sent to ECharts. They do
// not emulate its renderer or require a DOM, browser, network, or live timers.
function snapshot(value: any): any {
  if (Array.isArray(value)) return value.map(snapshot)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, snapshot(entry)]))
  }
  return value
}

export class FakeChart {
  options: any[] = []
  setOptionCalls: { option: any; options: any }[] = []
  resizeCalls = 0
  disposeCalls = 0
  disposed = false
  exportCalls: any[] = []
  private model: any = undefined

  getOption(): any { return snapshot(this.model) }

  getDataURL(options: any): string {
    this.exportCalls.push(snapshot(options))
    return 'data:image/png;base64,dGVzdA=='
  }

  setOption(option: any, options?: any): void {
    if (this.disposed) throw new Error('setOption called after disposal')
    const copy = snapshot(option)
    this.options.push(copy)
    this.setOptionCalls.push({ option: copy, options: snapshot(options) })
    const merge = (old: any, next: any): any => {
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        const result = { ...old }
        for (const key of Object.keys(next)) result[key] = merge(old?.[key], next[key])
        return result
      }
      return snapshot(next)
    }
    this.model = merge(options === true || options?.notMerge ? undefined : this.model, option)
  }

  resize(): void {
    if (this.disposed) throw new Error('resize called after disposal')
    this.resizeCalls++
  }

  dispose(): void {
    this.disposeCalls++
    this.disposed = true
  }
}

export function createBrowserHarness(sourceRoot: string = process.cwd(), injectedECharts?: any, injectedDocument?: any) {
  const charts: FakeChart[] = []
  const initThemes: any[] = []
  const resizeListeners = new Set<() => void>()
  const window = {
    resizeListeners,
    addEventListener(type: string, listener: () => void): void {
      if (type !== 'resize') throw new Error(`Unexpected event: ${type}`)
      resizeListeners.add(listener)
    },
    removeEventListener(type: string, listener: () => void): void {
      if (type !== 'resize') throw new Error(`Unexpected event: ${type}`)
      resizeListeners.delete(listener)
    },
    dispatchResize(): void {
      for (const listener of [...resizeListeners]) listener()
    },
  }
  let nextTimer = 1
  const active = new Map<number, { callback: () => void; interval: number }>()
  const callbacks = new Map<number, () => void>()
  const clearCalls: number[] = []
  const timers = {
    active,
    callbacks,
    clearCalls,
    setInterval(callback: () => void, interval: number): number {
      const timer = nextTimer++
      active.set(timer, { callback, interval })
      callbacks.set(timer, callback)
      return timer
    },
    clearInterval(timer: number): void {
      clearCalls.push(timer)
      active.delete(timer)
    },
    tick(timer?: number): void {
      const entries = timer === undefined ? [...active] : [[timer, active.get(timer)] as const]
      for (const [id, entry] of entries) {
        if (entry && active.has(id)) entry.callback()
      }
    },
  }

  const echarts = injectedECharts ?? {
    color: echartsColor,
    getInstanceByDom(): undefined { return undefined },
    init(_dom: unknown, theme: unknown): FakeChart {
      initThemes.push(snapshot(theme))
      const chart = new FakeChart()
      charts.push(chart)
      return chart
    },
  }

  // Compile the actual source with the project's declared esbuild dev
  // dependency. Type checking remains in `npm run lint`. A narrow local resolver
  // replaces only ECharts and evaluates the real palette. Dependencies and
  // browser globals are isolated per harness.
  // sourceRoot defaults to the repository root used by `npm test` and `bun test`.
  function evaluate(path: string, require: (specifier: string) => any): any {
    const filename = resolve(sourceRoot, path)
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
      sourcefile: filename,
      loader: 'ts',
      target: 'es2022',
      format: 'cjs',
    })
    const module = { exports: {} }
    const execute = new Function('require', 'module', 'exports', 'window', 'setInterval', 'clearInterval', 'document', code)
    execute(require, module, module.exports, window, timers.setInterval, timers.clearInterval, injectedDocument)
    return module.exports
  }
  const rejectImport = (specifier: string): never => { throw new Error(`Unexpected import: ${specifier}`) }
  const palette = evaluate('src/style/palette.ts', rejectImport)
  function canonicalModule(): any {
    const generated = evaluate('src/style/canonical-generated.ts', rejectImport)
    return evaluate('src/style/canonical.ts', specifier => {
      if (specifier === './canonical-generated.js') return generated
      return rejectImport(specifier)
    })
  }
  const plotter = evaluate('src/core/plotter.ts', (specifier: string) => {
    if (specifier === 'echarts') return echarts
    if (specifier === '../style/palette.js') return palette
    if (specifier === '../style/canonical.js') return canonicalModule()
    if (specifier === '../style/surface.js') return evaluate('src/style/surface.ts', rejectImport)
    if (specifier === './surface.js') return evaluate('src/core/surface.ts', rejectImport)
    return rejectImport(specifier)
  }) as { Figure: typeof Figure }

  return { Figure: plotter.Figure, charts, initThemes, window, timers }
}
