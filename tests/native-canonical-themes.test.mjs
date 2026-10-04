/** Opt-in native rendering, never a browser-acceptance substitute.
 * npm run build && node --import tsx --test tests/native-canonical-themes.test.mjs
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme } from '../dist/svg.js'
import { createBrowserHarness } from './helpers/browser-figure.ts'
import { addAllSvgCharts } from './fixtures/canonical-charts.ts'

const require = createRequire(import.meta.url)
const canvas = require('canvas')
const echarts = require('echarts')
const { createCanvas, loadImage } = canvas
const evidenceDir = process.env.PLOT_TS_CANONICAL_EVIDENCE_DIR
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true })
const measurements = []
const artifacts = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (name, bytes) => {
  if (evidenceDir) {
    writeFileSync(join(evidenceDir, name), bytes)
    artifacts.push({ name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) })
  }
}
const rgba = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255)
const pixel = (surface, x, y) => [...surface.getContext('2d').getImageData(x, y, 1, 1).data]
function countColor(surface, color) {
  const expected = rgba(color)
  const pixels = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data
  let count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (expected.every((value, channel) => Math.abs(value - pixels[i + channel]) <= 1)) count++
  }
  return count
}
async function record(name, surface, paper, seriesColor) {
  const bytes = surface.toBuffer('image/png')
  const image = await loadImage(bytes)
  assert.equal(image.width, surface.width)
  assert.equal(image.height, surface.height)
  const decoded = createCanvas(image.width, image.height)
  decoded.getContext('2d').drawImage(image, 0, 0)
  assert.deepEqual(pixel(decoded, image.width - 1, image.height - 1), rgba(paper))
  const paperPixels = countColor(decoded, paper)
  assert.ok(paperPixels > 1000)
  assert.ok(image.width * image.height - paperPixels > 1000, 'nonempty chart pixels')
  let seriesPixels
  if (seriesColor) {
    seriesPixels = countColor(decoded, seriesColor)
    assert.ok(seriesPixels > 50, `${name}: actual series-colored pixels (${seriesPixels})`)
  }
  save(`${name}.png`, bytes)
  measurements.push({ name, width: image.width, height: image.height, bytes: bytes.length, sha256: hash(bytes), paperPixels, seriesPixels })
  return decoded
}
after(() => {
  save('measurements.json', JSON.stringify({
  versions: { node: process.version, platform: process.platform, arch: process.arch, canvas: canvas.version, echarts: echarts.version, cairo: canvas.cairoVersion, pango: canvas.pangoVersion, rsvg: canvas.rsvgVersion },
  source: JSON.parse(readFileSync(new URL('../assets/canonical/source.json', import.meta.url), 'utf8')),
  bundles: ['dist/svg.js', 'dist/plot-ts.js'].map(path => ({ path, sha256: hash(readFileSync(path)) })),
  nativeBinding: { path: 'node_modules/canvas/build/Release/canvas.node', sha256: hash(readFileSync('node_modules/canvas/build/Release/canvas.node')) },
  browserAcceptance: false,
  measurements,
  }, null, 2) + '\n')
  save('artifact-manifest.json', JSON.stringify({ artifacts }, null, 2) + '\n')
})

echarts.setPlatformAPI({ createCanvas: () => createCanvas(1, 1) })
const harness = createBrowserHarness()

for (const name of CANONICAL_THEME_NAMES) {
  const theme = getCanonicalTheme(name)
  test(`${name}: packed pure SVG ten-family gallery decodes to actual native PNG`, async () => {
    assert.equal(typeof globalThis.window, 'undefined')
    assert.equal(typeof globalThis.document, 'undefined')
    assert.ok(canvas.rsvgVersion, 'native SVG decode requires this build capability')
    const report = addAllSvgCharts(figure({ theme: name, width: 1600, height: 1480, title: name, columns: 3, gap: 32 }))
    const svg = report.render()
    save(`${name}-svg-gallery.html`, report.renderHtml())
    save(`${name}-svg-gallery.svg`, svg)
    const decoded = await loadImage(Buffer.from(svg))
    const surface = createCanvas(1600, 1480)
    surface.getContext('2d').drawImage(decoded, 0, 0)
    await record(`${name}-svg-gallery`, surface, theme.tokens['--paper'], theme.tokens['--s1'])
  })
  for (const kind of ['line', 'bar', 'scatter', 'area', 'heatmap']) {
    test(`${name}: Figure-generated ${kind} options render in native ECharts`, async () => {
      // The existing harness runs actual Figure option construction. A native
      // ECharts instance then consumes those options/theme. Figure itself still
      // requires a browser HTMLElement, so no fake server Figure API is claimed.
      const fig = new harness.Figure({ style: {} }, { theme: name, title: `${name}: ${kind}`, animated: false })
      if (kind === 'line') fig.plot([0, 1, 2, 3], [2, 6, 4, 8], { width: 4 })
      if (kind === 'bar') fig.bar(['A', 'B', 'C', 'D'], [12, 24, 18, 30])
      if (kind === 'scatter') fig.scatter([1, 2, 3, 4], [2, 7, 4, 8], { size: 20, opacity: 1 })
      if (kind === 'area') fig.area([0, 1, 2, 3], [2, 6, 4, 8])
      if (kind === 'heatmap') fig.heatmap([[0, 1, 2], [3, 4, 5]], ['A', 'B', 'C'], ['Top', 'Bottom'], { showValues: true })
      fig.render()
      const option = harness.charts.at(-1).options[0]
      const initTheme = harness.initThemes.at(-1)
      const surface = createCanvas(800, 500)
      const chart = echarts.init(surface, initTheme)
      try {
        chart.setOption(option)
        assert.deepEqual(chart.getOption().series[0].data, option.series[0].data)
        const decoded = await record(`${name}-echarts-${kind}`, surface, theme.tokens['--paper'], kind === 'heatmap' ? undefined : theme.tokens['--s1'])
        assert.ok(countColor(decoded, theme.tokens['--ink']) > 30, 'title/text uses canonical ink')
        // Exercise the exact export settings supplied by Figure, including paper.
        fig.exportImage('png')
        const exportOptions = harness.charts.at(-1).exportCalls[0]
        const bytes = Buffer.from(chart.getDataURL(exportOptions).split(',')[1], 'base64')
        const large = await loadImage(bytes)
        assert.equal(large.width, 1600)
        assert.equal(large.height, 1000)
        save(`${name}-echarts-${kind}-2x.png`, bytes)
        if (kind === 'bar') {
          save(`${name}-echarts-input.json`, JSON.stringify({ theme: initTheme, option, exportOptions }, null, 2) + '\n')
        }
      } finally { chart.dispose(); fig.dispose() }
      assert.equal(chart.isDisposed(), true)
    })
  }
}


for (const name of ['sage', 'sage-dark']) {
  test(`${name}: stacked label contrast retains actual SVG/PNG evidence`, async () => {
    const theme = getCanonicalTheme(name)
    const svg = figure({ theme: name, width: 400, height: 300, title: 'Stacked labels' })
      .bar({ categories: ['A'], series: [{ values: [20] }, { values: [40] }], stacked: true }).render()
    save(`${name}-stacked-labels.svg`, svg)
    const image = await loadImage(Buffer.from(svg))
    const surface = createCanvas(400, 300)
    surface.getContext('2d').drawImage(image, 0, 0)
    await record(`${name}-stacked-labels`, surface, theme.tokens['--paper'], theme.tokens['--s1'])
  })
}
