/** Actual locked ECharts/native canvas; injected listener host is not browser QA.
 * npm run build && node --import tsx --test tests/native-browser-surface-policy.test.mjs
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CANONICAL_THEME_NAMES, getCanonicalTheme } from '../dist/svg.js'
import { createBrowserHarness } from './helpers/browser-figure.ts'

const require = createRequire(import.meta.url)
const canvas = require('canvas'), echarts = require('echarts')
const { createCanvas, loadImage } = canvas
const dir = process.env.PLOT_TS_BROWSER_SURFACE_EVIDENCE_DIR
if (dir) mkdirSync(dir, { recursive: true })
const records = [], artifacts = []
const hash = data => createHash('sha256').update(data).digest('hex')
function save(name, data) { if (dir) { writeFileSync(join(dir, name), data); artifacts.push({ name, bytes: Buffer.byteLength(data), sha256: hash(data) }) } }
echarts.setPlatformAPI({ createCanvas: () => createCanvas(1, 1) })
const harness = createBrowserHarness(process.cwd(), echarts)
const surface = () => Object.assign(createCanvas(800, 500), { style: {} })
const pixel = (canvas, x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]
function alpha(c) {
  const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let clear = 0, painted = 0
  for (let i = 3; i < p.length; i += 4) p[i] ? painted++ : clear++
  return { clear, painted }
}
async function exported(fig, name, clear) {
  const bytes = Buffer.from(fig.exportImage('png').split(',')[1], 'base64')
  const image = await loadImage(bytes)
  assert.equal(image.width, 1600); assert.equal(image.height, 1000)
  const copy = createCanvas(1600, 1000); copy.getContext('2d').drawImage(image, 0, 0)
  assert.equal(pixel(copy, 1599, 999)[3], clear ? 0 : 255)
  const counts = alpha(copy)
  assert.ok(counts.painted > 500, 'actual marks/text survive in decoded PNG')
  if (clear) assert.ok(counts.clear > 1000)
  save(name + '.png', bytes); records.push({ name, ...counts, sha256: hash(bytes) })
  return copy
}
function add(fig, kind) {
  if (kind === 'line') fig.plot([0,1,2,3], [2,6,4,8], { color: '#12AB34', width: 4 })
  if (kind === 'bar') fig.bar(['A','B','C','D'], [2,6,4,8], { color: '#12AB34' })
  if (kind === 'scatter') fig.scatter([0,1,2,3], [2,6,4,8], { color: '#12AB34', size: 16, opacity: 1 })
  if (kind === 'area') fig.area([0,1,2,3], [2,6,4,8], { color: '#12AB34' })
  if (kind === 'heatmap') fig.heatmap([[0,1,2],[3,4,5]], ['A','B','C'], ['D','E'], { colormap: 'plasma', showValues: true })
  return fig
}
function make(theme, policy, kind = 'bar') {
  const c = surface(), fig = new harness.Figure(c, { ...(theme ? { theme } : {}), surfacePolicy: policy, animated: false, title: kind })
  add(fig, kind).render()
  return { fig, c, chart: fig.getRawChart() }
}

after(() => {
  save('measurements.json', JSON.stringify({
    versions: { node: process.version, canvas: canvas.version, echarts: echarts.version, cairo: canvas.cairoVersion },
    bundles: ['dist/svg.js','dist/plot-ts.js'].map(path => ({ path, sha256: hash(readFileSync(path)) })),
    nativeBinding: { sha256: hash(readFileSync('node_modules/canvas/build/Release/canvas.node')) },
    browserAcceptance: false, tooltipViewNativeSupport: false,
    records,
  }, null, 2) + '\n')
  save('artifact-manifest.json', JSON.stringify({ artifacts }, null, 2) + '\n')
  assert.equal(harness.window.resizeListeners.size, 0)
})

for (const theme of [undefined, 'dark', ...CANONICAL_THEME_NAMES]) for (const policy of ['themed-v1','transparent-root-v1','transparent-auto-v1']) {
  test(`${theme ?? 'default'}/${policy}: five chart families render/export with actual alpha`, async () => {
    for (const kind of ['line','bar','scatter','area','heatmap']) {
      const { fig, c, chart } = make(theme, policy, kind)
      try {
        const option = chart.getOption()
        assert.equal(option.series[0].data.length, kind === 'heatmap' ? 6 : 4)
        if (kind !== 'heatmap') assert.equal(option.series[0].itemStyle.color, '#12AB34')
        if (policy !== 'themed-v1') assert.equal(option.backgroundColor, 'transparent')
        if (policy === 'transparent-auto-v1') {
          assert.equal(option.grid[0].backgroundColor, 'transparent')
          assert.equal(option.tooltip[0].backgroundColor, 'transparent')
          assert.equal(option.xAxis[0].axisPointer.label.backgroundColor, 'transparent')
          if (kind === 'heatmap') assert.equal(option.visualMap[0].backgroundColor, 'transparent')
        }
        if (CANONICAL_THEME_NAMES.includes(theme) && kind === 'bar' && policy !== 'themed-v1') {
          assert.equal(pixel(c, 85, 95)[3], policy === 'transparent-root-v1' ? 255 : 0, 'root-only preserves canonical grid panel')
        }
        const name = `${theme ?? 'default'}-${policy}-${kind}`
        await exported(fig, name, policy !== 'themed-v1')
        if (kind === 'bar') save(name + '-options.json', JSON.stringify(option, null, 2) + '\n')
      } finally { fig.dispose() }
    }
  })
}

test('native setOption preserves authored semantic graphics and rejects visible backing before mutation', async () => {
  const { fig, c, chart } = make('sage-dark', 'transparent-auto-v1')
  try {
    const graphic = [{ id: 'semantic-white', type: 'rect', shape: { x: 15, y: 15, width: 30, height: 25 }, style: { fill: '#FFFFFF' } }]
    chart.setOption({ graphic })
    assert.deepEqual(pixel(c, 25, 25), [255,255,255,255])
    assert.equal(pixel(c, 799, 499)[3], 0)
    const before = hash(c.toBuffer('image/png'))
    for (const option of [{ backgroundColor: 'red' }, { grid: [{ backgroundColor: 'blue' }] }, { tooltip: { backgroundColor: '#fff' } }, { tooltip: { extraCssText: 'background:red!important' } }, { tooltip: { className: 'opaque-card' } }, { media: [{ query: { minWidth: 9999 }, option: { legend: { backgroundColor: '#fff' } } }] }]) {
      assert.throws(() => chart.setOption(option), /Surface policy conflict/)
      assert.equal(hash(c.toBuffer('image/png')), before)
    }
    fig.update(); assert.deepEqual(pixel(c, 25, 25), [255,255,255,255])
    await exported(fig, 'semantic-raw-graphic', true)
  } finally { fig.dispose() }
})

test('native both overloads, id/array merges, replaceMerge and lazyUpdate retain clear ownership', async () => {
  const { fig, chart } = make('sage-dark', 'transparent-auto-v1')
  try {
    chart.setOption({ series: [{ id: 'plot-ts-series-0', data: [8,4,6,2] }] }, false, true)
    assert.deepEqual(chart.getOption().series[0].data, [8,4,6,2])
    await exported(fig, 'lazy-update', true)
    chart.setOption({ series: [{ id: 'replacement', type: 'bar', data: [1,2,3,4], itemStyle: { color: 'white' } }] }, { replaceMerge: ['series'], lazyUpdate: true })
    assert.equal(chart.getOption().series.length, 1); assert.equal(chart.getOption().series[0].id, 'replacement')
    await exported(fig, 'replace-merge', true)
    chart.setOption({ xAxis: { type: 'category', data: ['A','B'] }, yAxis: {}, grid: {}, tooltip: {}, series: [{ type: 'bar', data: [2,4] }], animation: false }, { notMerge: true })
    assert.deepEqual(chart.getOption().series[0].data, [2,4]); await exported(fig, 'not-merge', true)
  } finally { fig.dispose() }
})

test('native future media/timeline options retain clear backings without changing data transitions', async () => {
  const { fig, chart } = make(undefined, 'transparent-auto-v1')
  try {
    chart.setOption({
      baseOption: { animation: false, timeline: { axisType: 'category', data: ['first','second'], autoPlay: false }, xAxis: { type: 'category', data: ['A','B'] }, yAxis: {}, grid: {}, tooltip: {}, series: [{ type: 'bar', data: [1,2] }] },
      options: [{ series: [{ data: [2,4] }] }, { series: [{ data: [4,2] }] }],
      media: [{ query: { maxWidth: 500 }, option: { grid: { left: 60 } } }],
    }, { notMerge: true })
    chart.dispatchAction({ type: 'timelineChange', currentIndex: 1 })
    assert.deepEqual(chart.getOption().series[0].data, [4,2])
    assert.equal(chart.getOption().backgroundColor, 'transparent')
    chart.resize({ width: 480, height: 300 })
    assert.equal(chart.getOption().grid[0].backgroundColor, 'transparent')
    assert.equal(chart.getOption().grid[0].left, 60)
    const bytes = Buffer.from(fig.exportImage().split(',')[1], 'base64'); const image = await loadImage(bytes)
    assert.equal(image.width, 960); assert.equal(image.height, 600)
    save('media-timeline.png', bytes)
  } finally { fig.dispose() }
})

test('native prototype bypass is detected before typed export/update, and reuse rejects before DOM size writes', () => {
  const { fig, c, chart } = make('sage-dark', 'transparent-auto-v1')
  try {
    const style = { ...c.style }
    assert.throws(() => new harness.Figure(c, { surfacePolicy: 'transparent-auto-v1', width: 123 }), /dispose the existing/)
    assert.deepEqual(c.style, style)
    assert.throws(() => new harness.Figure(c, { surfacePolicy: 'themed-v1', width: 321 }), /dispose the existing/)
    assert.throws(() => new harness.Figure(c), /dispose the existing/)
    assert.deepEqual(c.style, style)
    Object.getPrototypeOf(chart).setOption.call(chart, { backgroundColor: '#abcdef' })
    assert.throws(() => fig.exportImage(), /live.*background/)
    assert.throws(() => fig.update(), /live.*background/)
    assert.throws(() => fig.title('blocked'), /live.*background/)
    assert.throws(() => fig.bar(['blocked'], [99]), /live.*background/)
    assert.throws(() => fig.appendPoint(4, 99, 0, 1), /live.*background/)
    assert.throws(() => fig.resize(), /live.*background/)
    assert.throws(() => harness.window.dispatchResize(), /live.*background/)
    // A caller-requested clear/reset remains the supported way to re-establish
    // ownership after bypassing the guard; no authored content is erased silently.
    chart.clear(); fig.render(); assert.equal(chart.getOption().backgroundColor, 'transparent')
    assert.equal(chart.getOption().title[0].text, 'bar')
    assert.equal(chart.getOption().series.length, 1)
    assert.deepEqual(chart.getOption().series[0].data, [2,6,4,8])
  } finally { fig.dispose() }
})

for (const policy of ['transparent-root-v1','transparent-auto-v1']) test(`${policy}: native axis-pointer labels retain glyphs and obey backing policy`, async () => {
  const { fig, chart } = make('sage-dark', policy, 'scatter')
  try {
    chart.setOption({ tooltip: { renderMode: 'richText', axisPointer: { type: 'cross', label: { show: true } } } })
    chart.dispatchAction({ type: 'updateAxisPointer', x: 400, y: 200 })
    const list = chart.getZr().storage.getDisplayList(true)
    const labels = list.filter(e => e.type === 'tspan' && /^\d+\.\d{2,}$/.test(e.style.text ?? ''))
    assert.ok(labels.length >= 2, 'actual axis pointer label glyphs exist')
    const plates = list.filter(e => e.type === 'rect' && e.style.fill && e.style.fill !== getCanonicalTheme('sage-dark').tokens['--panel'] && echarts.color.parse(e.style.fill)?.[3] > 0)
    assert.equal(plates.length, policy === 'transparent-auto-v1' ? 0 : 2)
    await exported(fig, `${policy}-axis-pointer`, true)
    save(`${policy}-axis-pointer-display.json`, JSON.stringify(list.map(e => ({ type: e.type, text: e.style?.text, fill: e.style?.fill })), null, 2) + '\n')
  } finally { fig.dispose() }
})

test('upstream Node tooltip controller remains unsupported; no environment flag is changed', () => {
  const { fig, chart } = make('sage-dark', 'transparent-auto-v1')
  try {
    chart.setOption({ tooltip: { renderMode: 'richText', formatter: () => 'TOOLTIP_SENTINEL' } })
    chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })
    assert.ok(!chart.getZr().storage.getDisplayList(true).some(e => String(e.style?.text).includes('TOOLTIP_SENTINEL')))
    assert.equal(chart.getOption().tooltip[0].backgroundColor, 'transparent')
    assert.equal(typeof globalThis.window, 'undefined'); assert.equal(typeof globalThis.document, 'undefined')
    save('tooltip-native-boundary.json', JSON.stringify({ lockedECharts: echarts.version, upstreamNodeGate: 'TooltipView init/render/manuallyShowTip return when env.node', actualControllerRendered: false, generatedBackground: 'transparent', browserAcceptance: false }, null, 2) + '\n')
  } finally { fig.dispose() }
})
