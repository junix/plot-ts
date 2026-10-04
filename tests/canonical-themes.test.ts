import { semanticMarks } from './helpers/svg-motion.js';
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CANONICAL_THEME_NAMES, getCanonicalTheme, canonicalMarkText } from '../src/style/canonical.js'
import { figure, type CanonicalThemeName } from '../src/svg/index.js'
import { COLORS, THEMES, getTheme, setTheme, withTheme } from '../src/style/palette.js'
import { addAllSvgCharts } from './fixtures/canonical-charts.js'
import { createBrowserHarness } from './helpers/browser-figure.js'

const families = ['azure', 'mist-blue', 'sage', 'stone-teal', 'dusty-violet', 'warm-sand', 'olive-paper']
const tokenNames = ['--ink', '--muted', '--faint', '--grid', '--paper', '--panel', '--line', '--accent', '--accent-ink', '--accent-soft', '--edge', '--group', '--group-line', ...Array.from({ length: 8 }, (_, i) => `--s${i + 1}`), '--pos', '--warn', '--neg']
const raw = readFileSync(new URL('../assets/canonical/theme.json', import.meta.url))
const registry = JSON.parse(raw.toString())
const source = JSON.parse(readFileSync(new URL('../assets/canonical/source.json', import.meta.url), 'utf8'))


function geometry(svg: string): string {
  return svg.replace(/<rect[^>]*data-plot-surface="paper"[^>]*\/>/g, '')
    .replace(/ (?:fill|stroke|opacity|stroke-opacity)="[^"]*"/g, '')
}

function container(): HTMLElement { return { style: {} } as HTMLElement }

function addBrowserSeries(fig: any) {
  fig.plot([0, 1], [2, 4]).scatter([0, 1], [4, 2]).bar(['A', 'B'], [3, 6]).area([0, 1], [5, 7])
  for (let i = 4; i < 10; i++) fig.plot([0, 1], [i, i + 1])
  return fig
}

test('canonical source is pinned by commit, SHA-256, Git blob and exact schema', () => {
  assert.equal(source.repository, 'junix/diagram-theme-rs')
  assert.equal(source.commit, '1cc4e6667aa86444a7e9055549aa85cac293dc07')
  assert.equal(source.path, 'registry/theme.json')
  assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256)
  assert.equal(createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex'), source.git_blob_sha1)
  assert.equal(registry.spec, 'diagram-theme/v1')
  assert.equal(registry.version, '1.0.0')
  assert.deepEqual(Object.keys(registry.themes), families)
  assert.deepEqual(CANONICAL_THEME_NAMES, families.flatMap(name => [name, `${name}-dark`]))
})

for (const name of CANONICAL_THEME_NAMES) {
  const theme = getCanonicalTheme(name)
  const family = name.replace(/-dark$/, '')
  const mode = name.endsWith('-dark') ? 'dark' : 'light'
  test(`${name}: every canonical token and categorical order matches upstream`, () => {
    assert.deepEqual(Object.keys(theme.tokens), tokenNames)
    assert.deepEqual(theme.tokens, registry.themes[family][mode])
    assert.deepEqual(theme.series, Array.from({ length: 8 }, (_, i) => registry.themes[family][mode][`--s${i + 1}`]))
    assert.ok(Object.isFrozen(theme) && Object.isFrozen(theme.tokens) && Object.isFrozen(theme.series))
    assert.throws(() => { (theme.series as string[])[0] = '#badbad' }, TypeError)
    assert.equal(getCanonicalTheme(name).series[0], registry.themes[family][mode]['--s1'])
  })
  test(`${name}: all ten SVG families consume colors without changing data/geometry`, () => {
    const options = { width: 1600, height: 1480, title: 'Theme & chart', columns: 3, gap: 32 }
    const plain = addAllSvgCharts(figure(options)).render()
    const chart = addAllSvgCharts(figure({ ...options, theme: name }))
    const themed = chart.render()
    assert.equal(geometry(themed), geometry(plain))
    assert.equal(chart.render(), themed)
    assert.doesNotMatch(themed, /NaN|Infinity|undefined/)
    for (const color of theme.series) assert.ok(themed.includes(`fill="${color}"`), `${name} missing series ${color}`)
    for (const token of ['--ink', '--muted', '--grid', '--line', '--paper', '--pos', '--warn', '--neg'] as const) {
      assert.ok(themed.includes(theme.tokens[token]), `${name} missing token ${token}`)
    }
    const html = chart.renderHtml()
    assert.deepEqual(semanticMarks(html), semanticMarks(themed))
    assert.equal((html.match(/<style>/g) ?? []).length, 1)
    assert.equal((html.match(/<\/style>/g) ?? []).length, 1)
    assert.ok(html.includes(`background: ${theme.tokens['--paper']};`))
    assert.ok(html.includes(`--ink: ${theme.tokens['--ink']};`))
    assert.equal((themed.match(/data-plot-surface="paper"/g) ?? []).length, 1)
  })
  test(`${name}: Figure supplies native ECharts theme, all categorical consumers and export color`, () => {
    const harness = createBrowserHarness()
    const fig = addBrowserSeries(new harness.Figure(container(), { theme: name, animated: false, title: 'Canonical' }))
    fig.render()
    const t = theme.tokens
    const init = harness.initThemes[0]
    assert.equal(init.backgroundColor, t['--paper'])
    assert.deepEqual(init.color, theme.series)
    assert.equal(init.textStyle.color, t['--ink'])
    assert.equal(init.title.textStyle.color, t['--ink'])
    assert.equal(init.legend.textStyle.color, t['--muted'])
    assert.equal(init.tooltip.backgroundColor, t['--panel'])
    assert.equal(init.grid.backgroundColor, t['--panel'])
    for (const axis of ['categoryAxis', 'valueAxis', 'logAxis', 'timeAxis']) {
      assert.equal(init[axis].axisLabel.color, t['--muted'])
      assert.equal(init[axis].axisLine.lineStyle.color, t['--line'])
      assert.equal(init[axis].splitLine.lineStyle.color, t['--grid'])
    }
    const option = harness.charts[0]!.options[0]
    for (let i = 0; i < 10; i++) assert.equal(option.series[i].itemStyle.color, theme.series[i % 8])
    assert.equal(option.series[0].lineStyle.color, t['--s1'])
    assert.equal(option.series[3].areaStyle.color, t['--s4'])
    fig.exportImage('png'); fig.exportImage('jpeg')
    assert.deepEqual(harness.charts[0]!.exportCalls, ['png', 'jpeg'].map(type => ({ type, pixelRatio: 2, backgroundColor: t['--paper'] })))
    fig.dispose()
    assert.equal(harness.window.resizeListeners.size, 0)
  })
}

test('Figure preserves explicit colors, semantic heatmap palettes and custom violin data colors', () => {
  const harness = createBrowserHarness()
  const fig = new harness.Figure(container(), { theme: 'sage-dark', animated: false })
    .plot([0], [1], { color: 'transparent' }).scatter([0], [1], { color: '#123456' })
    .bar(['A'], [1], { color: 'red' }).area([0], [1], { color: 'rgba(1,2,3,0.5)' })
    .heatmap([[0, 1]], [], [], { colormap: 'plasma' })
  fig.render()
  const option = harness.charts[0]!.options[0]
  assert.deepEqual(option.series.slice(0, 4).map((s: any) => s.itemStyle.color), ['transparent', '#123456', 'red', 'rgba(1,2,3,0.5)'])
  assert.deepEqual(option.visualMap.inRange.color, COLORS.plasma)
  assert.deepEqual(option.visualMap.seriesIndex, [4])
  assert.deepEqual([option.visualMap.min, option.visualMap.max], [0, 1])
  const violin = new harness.Figure(container(), { theme: 'sage-dark', animated: false }).violin(['A', 'B'], [[1, 2], [3, 4]])
  violin.render()
  assert.deepEqual(harness.charts[1]!.options[0].series[0].data.map((v: any) => v.itemStyle.color), getCanonicalTheme('sage-dark').series.slice(0, 2))
  const custom = new harness.Figure(container(), { theme: 'sage-dark', animated: false }).violin(['A'], [[1, 2]], { color: 'transparent' })
  custom.render()
  assert.equal(harness.charts[2]!.options[0].series[0].data[0].itemStyle.color, 'transparent')
  fig.dispose(); violin.dispose(); custom.dispose()
})

test('Figure data, geometry, axis updates and heatmap domains are identical across theme choices', () => {
  const harness = createBrowserHarness()
  const options = CANONICAL_THEME_NAMES.map(theme => ({ theme, animated: false })).concat([{ animated: false } as any])
  const all = options.map(config => {
    const fig = addBrowserSeries(new harness.Figure(container(), config))
      .xAxis({ label: 'X', min: 0, max: 12, grid: false }).yAxis({ label: 'Y', min: -2, max: 15, log: true, grid: true })
      .heatmap([[1, 3], [5, 7]], ['A', 'B'], ['C', 'D'], { colormap: 'blues' })
    fig.render()
    const option = harness.charts.at(-1)!.options[0]
    const stripColor = (value: any): any => {
      if (Array.isArray(value)) return value.map(stripColor)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'color').map(([key, entry]) => [key, stripColor(entry)]))
      return typeof value === 'function' ? value.toString() : value
    }
    fig.dispose()
    return stripColor(option)
  })
  for (const option of all) assert.deepEqual(option, all.at(-1))
})

test('SVG preserves selected heatmap scales and explicit gauge bands including transparent marks', () => {
  for (const theme of CANONICAL_THEME_NAMES) {
    for (const colormap of ['viridis', 'plasma', 'blues'] as const) {
      const plain = figure().heatmap({ data: [[0, 1]], colormap }).render()
      const themed = figure({ theme }).heatmap({ data: [[0, 1]], colormap }).render()
      const fills = (s: string) => [...s.matchAll(/<rect(?![^>]*data-plot-surface)[^>]*fill="([^"]+)"/g)].map(m => m[1])
      assert.deepEqual(fills(themed), fills(plain))
    }
    const bands = [{ from: 0, to: 50, color: 'transparent' }, { from: 50, to: 100, color: '#abcdef' }]
    const svg = figure({ theme }).gauge({ value: 72, max: 100, bands }).render()
    assert.match(svg, /fill="transparent" opacity="0.8"/)
    assert.match(svg, /fill="#abcdef" opacity="0.8"/)
    assert.deepEqual(bands, [{ from: 0, to: 50, color: 'transparent' }, { from: 50, to: 100, color: '#abcdef' }])
  }
})

test('canonical lookup rejects unknown and prototype-like names; figures do not share mutable state', () => {
  for (const name of ['', 'light', 'unknown', 'Azure', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => getCanonicalTheme(name), RangeError)
    assert.throws(() => figure({ theme: name as CanonicalThemeName }), RangeError)
  }
  assert.ok(Object.isFrozen(CANONICAL_THEME_NAMES))
  const chart = figure({ theme: 'azure-dark' }).bar({ categories: ['A'], series: [{ values: [1] }] })
  const before = chart.render()
  figure({ theme: 'sage' }).bar({ categories: ['A'], series: [{ values: [2] }] }).render()
  assert.equal(chart.render(), before)
  assert.match(figure({ theme: 'azure-dark' }).render(), /data-plot-surface="paper"/)
})

test('six legacy themes, unknown ECharts names, default colors and export background are unchanged', () => {
  assert.deepEqual(Object.keys(THEMES), ['light', 'dark', 'editorial', 'vintage', 'neon', 'blueprint'])
  const before = getTheme()
  withTheme('dark', () => assert.equal(getTheme().name, 'dark'))
  assert.equal(getTheme(), before)
  assert.throws(() => setTheme('azure'), /Unknown theme/)
  const harness = createBrowserHarness()
  for (const theme of [undefined, 'dark', 'registered-external', '__proto__']) {
    const fig = new harness.Figure(container(), theme === undefined ? {} : { theme })
    fig.plot([0], [1]).render()
    assert.equal(harness.initThemes.at(-1), theme)
    const chart = harness.charts.at(-1)!
    assert.equal(chart.options[0].series[0].itemStyle.color, COLORS.tableau[0])
    fig.exportImage()
    assert.equal(chart.exportCalls[0].backgroundColor, '#fff')
    fig.dispose()
  }
})

test('canonical mark labels choose readable black or white without changing mark fills', () => {
  assert.equal(canonicalMarkText('#000000'), '#FFFFFF')
  assert.equal(canonicalMarkText('#FFFFFF'), '#000000')
  for (const name of CANONICAL_THEME_NAMES) {
    const color = getCanonicalTheme(name).series[0]!
    const svg = figure({ theme: name }).donut({ items: [{ name: 'Label', value: 1 }] }).render()
    assert.ok(svg.includes(`fill="${color}"`))
    assert.ok(svg.includes(`fill="${canonicalMarkText(color)}"`))
  }
})


test('stacked canonical labels contrast with their actual preceding surface, including mixed signs', () => {
  for (const name of ['sage', 'sage-dark'] as const) {
    const theme = getCanonicalTheme(name)
    for (const values of [[20, 40], [-20, -40], [20, -40, 30, -10]]) {
      const config = { categories: ['A'], series: values.map(value => ({ values: [value] })), stacked: true }
      const chart = figure({ theme: name }).bar(config).render()
      assert.equal(geometry(chart), geometry(figure().bar(config).render()))
      const surfaces = [...chart.matchAll(/<rect(?=[^>]*class="plt-grow")([^>]*)\/>/g)].map(match => {
        const attrs = Object.fromEntries([...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
        return { x: Number(attrs.x), y: Number(attrs.y), width: Number(attrs.width), height: Number(attrs.height), color: attrs.fill! }
      })
      const labels = [...chart.matchAll(/<text([^>]*)>(-?\d+)<\/text>/g)]
      assert.equal(labels.length, values.length)
      for (const label of labels) {
        const attrs = Object.fromEntries([...label[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
        const x = Number(attrs.x), y = Number(attrs.y) - 5
        const surface = surfaces.findLast(s => x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height)
        assert.equal(attrs.fill, canonicalMarkText(surface?.color ?? theme.tokens['--paper']))
      }
      if (values[0]! > 0) {
        assert.ok(labels[0]![1]!.includes(`fill="${canonicalMarkText(theme.tokens['--paper'])}"`))
      }
    }
  }
})
