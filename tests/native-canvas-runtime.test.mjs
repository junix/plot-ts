/**
 * Opt-in acceptance of declared native dependencies, not browser Figure tests.
 * Build first, then run: node --test tests/native-canvas-runtime.test.mjs
 * Set PLOT_TS_NATIVE_EVIDENCE_DIR to retain images and pixel measurements.
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { figure } from '../dist/svg.js'

const require = createRequire(import.meta.url)
const canvas = require('canvas')
const echarts = require('echarts')
const { createCanvas, loadImage } = canvas
const evidenceDir = process.env.PLOT_TS_NATIVE_EVIDENCE_DIR
const measurements = []
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true })

function save(name, bytes) {
  if (evidenceDir) writeFileSync(join(evidenceDir, name), bytes)
}
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
function pixels(surface) {
  return surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data
}
function pixel(surface, x, y) {
  return [...surface.getContext('2d').getImageData(x, y, 1, 1).data]
}
function countAlpha(surface, x = 0, y = 0, width = surface.width, height = surface.height) {
  const data = surface.getContext('2d').getImageData(x, y, width, height).data
  let transparent = 0, translucent = 0, opaque = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparent++
    else if (data[i] === 255) opaque++
    else translucent++
  }
  return { transparent, translucent, opaque, painted: translucent + opaque }
}
function countCyan(surface) {
  const data = pixels(surface)
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 4 && Math.abs(data[i + 1] - 169) < 4 && Math.abs(data[i + 2] - 240) < 4 && data[i + 3] > 80) count++
  }
  return count
}
async function decoded(bytes, width, height) {
  const image = await loadImage(bytes)
  assert.equal(image.width, width)
  assert.equal(image.height, height)
  const surface = createCanvas(width, height)
  surface.getContext('2d').drawImage(image, 0, 0)
  return surface
}
async function png(name, surface) {
  const bytes = surface.toBuffer('image/png')
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(bytes.readUInt32BE(16), surface.width)
  assert.equal(bytes.readUInt32BE(20), surface.height)
  const copy = await decoded(bytes, surface.width, surface.height)
  assert.deepEqual(pixels(copy), pixels(surface), `${name}: PNG pixel round-trip`)
  const measure = { name, width: surface.width, height: surface.height, bytes: bytes.length, sha256: hash(bytes), ...countAlpha(copy) }
  measurements.push(measure)
  save(name + '.png', bytes)
  return copy
}

const versions = {
  node: process.version, platform: process.platform, arch: process.arch,
  napi: process.versions.napi, canvas: canvas.version, echarts: echarts.version,
  cairo: canvas.cairoVersion, pango: canvas.pangoVersion,
  freetype: canvas.freetypeVersion, rsvg: canvas.rsvgVersion,
  jpeg: canvas.jpegVersion, gif: canvas.gifVersion,
}
after(() => save('measurements.json', JSON.stringify({ versions, measurements, browserAcceptance: false }, null, 2) + '\n'))

test('declared native binding loads without a browser or DOM shim', () => {
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')
  assert.match(canvas.version, /^3\./)
  assert.match(echarts.version, /^6\./)
  assert.ok(canvas.cairoVersion)
  assert.ok(canvas.pangoVersion)
})

test('transparent, translucent, and opaque native pixels survive a PNG round-trip', async () => {
  const surface = createCanvas(360, 240)
  const context = surface.getContext('2d')
  context.fillStyle = 'rgba(220, 30, 50, 0.5)'
  context.fillRect(20, 20, 120, 80)
  context.fillStyle = '#00a9f0'
  context.fillRect(170, 20, 120, 80)
  const copy = await png('native-alpha', surface)
  assert.equal(pixel(copy, 0, 0)[3], 0)
  assert.ok([127, 128].includes(pixel(copy, 50, 50)[3]))
  assert.deepEqual(pixel(copy, 200, 50), [0, 169, 240, 255])
})

test('native text metrics correspond to nonempty antialiased glyph pixels', async () => {
  const surface = createCanvas(480, 130)
  const context = surface.getContext('2d')
  context.font = '28px sans-serif'
  context.fillStyle = '#051c2c'
  const metrics = context.measureText('Native canvas 123')
  assert.ok(Number.isFinite(metrics.width) && metrics.width > 100 && metrics.width < 460)
  assert.ok(metrics.actualBoundingBoxAscent > 10)
  context.fillText('Native canvas 123', 12, 60)
  const copy = await png('native-glyphs', surface)
  const glyphs = countAlpha(copy, 10, 20, 450, 60)
  assert.ok(glyphs.painted > 700, 'text must produce actual glyph pixels')
  assert.ok(glyphs.translucent > 0, 'antialiased edge pixels')
  assert.equal(countAlpha(copy, 0, 90, 480, 40).painted, 0)
  measurements.push({ name: 'native-glyph-metrics', width: metrics.width, ascent: metrics.actualBoundingBoxAscent, ...glyphs })
})

test('PNG buffer callback, PNG stream, and data URL match synchronous encoding', async () => {
  const surface = createCanvas(80, 60)
  surface.getContext('2d').fillRect(8, 9, 20, 30)
  const sync = surface.toBuffer('image/png')
  const callback = await new Promise((resolve, reject) => surface.toBuffer((error, bytes) => error ? reject(error) : resolve(bytes), 'image/png'))
  const chunks = []
  for await (const chunk of surface.createPNGStream()) chunks.push(chunk)
  assert.deepEqual(callback, sync)
  assert.deepEqual(Buffer.concat(chunks), sync)
  assert.deepEqual(Buffer.from(surface.toDataURL('image/png').split(',')[1], 'base64'), sync)
})

test('native JPEG export and image loading retain requested dimensions', async () => {
  const surface = createCanvas(240, 160)
  const context = surface.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, 240, 160)
  context.fillStyle = '#00a9f0'
  context.fillRect(50, 40, 100, 70)
  const bytes = surface.toBuffer('image/jpeg', { quality: 0.9 })
  assert.deepEqual([...bytes.subarray(0, 2)], [255, 216])
  const copy = await decoded(bytes, 240, 160)
  assert.equal(countAlpha(copy).opaque, 240 * 160)
  assert.ok(pixel(copy, 75, 60)[2] > 200)
  save('native-jpeg.jpg', bytes)
})

test('ordinary malformed input rejects without corrupting the native context', async () => {
  await assert.rejects(loadImage(Buffer.from('not an image')), /Unsupported image type/)
  const surface = createCanvas(20, 20)
  const context = surface.getContext('2d')
  assert.throws(() => context.getImageData(0, 0, 0, 1), /source width is 0/)
  assert.throws(() => context.drawImage({}, 0, 0), /Image or Canvas expected/)
  context.fillRect(1, 1, 5, 5)
  assert.equal(pixel(surface, 2, 2)[3], 255)
  await png('native-after-errors', surface)
})

// This is the ECharts dependency's documented Node canvas route. plot-ts Figure
// is deliberately not instantiated: it requires a browser HTMLElement/window.
echarts.setPlatformAPI({ createCanvas: () => createCanvas(1, 1) })
const chartCases = {
  line: { xAxis: { type: 'value' }, series: [{ type: 'line', data: [[0, 2], [1, 6], [2, 4], [3, 8]], lineStyle: { width: 4 }, symbolSize: 10 }] },
  bar: { xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'] }, series: [{ type: 'bar', data: [12, 24, 18, 30] }] },
  scatter: { xAxis: { type: 'value' }, series: [{ type: 'scatter', symbolSize: 20, data: [[1, 2], [2, 7], [3, 4], [4, 8]] }] },
  area: { xAxis: { type: 'value' }, series: [{ type: 'line', areaStyle: { opacity: 0.35 }, data: [[0, 2], [1, 6], [2, 4], [3, 8]] }] },
  heatmap: { xAxis: { type: 'category', data: ['A', 'B', 'C'] }, yAxis: { type: 'category', data: ['Top', 'Bottom'] }, visualMap: { min: 0, max: 5, inRange: { color: ['#440154', '#21918c', '#fde725'] } }, series: [{ type: 'heatmap', label: { show: true }, data: [[0, 0, 0], [1, 0, 1], [2, 0, 2], [0, 1, 3], [1, 1, 4], [2, 1, 5]] }] },
}
for (const [name, options] of Object.entries(chartCases)) {
  test(`ECharts native ${name} export has real plot/title pixels and a transparent background`, async () => {
    const surface = createCanvas(800, 500)
    const chart = echarts.init(surface)
    try {
      chart.setOption({ animation: false, backgroundColor: 'transparent', color: ['#00a9f0'], title: { text: `Native ${name} export`, left: 20, top: 12 }, grid: { left: 80, right: 80, top: 80, bottom: 80 }, yAxis: { type: 'value' }, ...options })
      const copy = await png(`echarts-${name}`, surface)
      assert.equal(chart.getWidth(), 800)
      assert.equal(chart.getHeight(), 500)
      assert.equal(pixel(copy, 799, 499)[3], 0)
      assert.ok(countAlpha(copy, 20, 12, 600, 36).painted > 300, 'nonempty title glyphs')
      assert.ok(countAlpha(copy, 80, 80, 640, 340).painted > 300, 'nonempty plot pixels')
      if (name === 'heatmap') {
        const centers = [165, 335].flatMap(y => [186, 400, 613].map(x => pixel(copy, x, y)))
        assert.ok(centers.every(rgba => rgba[3] === 255), 'all six heatmap cells are filled')
        assert.equal(new Set(centers.map(rgba => rgba.slice(0, 3).join(','))).size, 6, 'all six values receive distinct colors')
      } else {
        assert.ok(countCyan(copy) > 200, 'actual series-colored pixels, not merely axes and grid')
      }
      const doubled = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: 'transparent' })
      const doubledBytes = Buffer.from(doubled.split(',')[1], 'base64')
      const large = await decoded(doubledBytes, 1600, 1000)
      assert.equal(pixel(large, 1599, 999)[3], 0)
      assert.ok(countAlpha(large).painted > 1000)
      save(`echarts-${name}-2x.png`, doubledBytes)
    } finally {
      chart.dispose()
    }
    assert.equal(chart.isDisposed(), true)
    assert.equal(echarts.getInstanceByDom(surface), undefined)
  })
}

test('ECharts native update and resize produce fresh output and release the instance', async () => {
  const surface = createCanvas(400, 280)
  const chart = echarts.init(surface)
  try {
    chart.setOption({ animation: false, xAxis: { type: 'category', data: ['A', 'B'] }, yAxis: {}, series: [{ id: 'values', type: 'bar', data: [2, 8] }] })
    const before = hash(surface.toBuffer('image/png'))
    chart.setOption({ series: [{ id: 'values', data: [8, 2] }] })
    assert.notEqual(hash(surface.toBuffer('image/png')), before)
    assert.ok(countAlpha(surface).painted > 1_000, 'updated plot is nonempty')
    assert.deepEqual(chart.getOption().series[0].data, [8, 2])
    chart.resize({ width: 620, height: 360, animation: { duration: 0 } })
    assert.equal(surface.width, 620)
    assert.equal(surface.height, 360)
    // resize schedules painting. ECharts's synchronous export API refreshes
    // the native surface; raw canvas.toBuffer() immediately after resize may
    // otherwise encode a blank, newly resized buffer.
    const resized = await decoded(Buffer.from(chart.getDataURL({ type: 'png', pixelRatio: 1 }).split(',')[1], 'base64'), 620, 360)
    assert.ok(countAlpha(resized).painted > 1_000, 'resized export must contain the chart')
    const copy = await png('echarts-updated-resized', surface)
    assert.deepEqual(pixels(copy), pixels(resized))
  } finally { chart.dispose() }
  assert.equal(chart.isDisposed(), true)
})

test('the built pure SVG entry renders all ten chart families for optional native SVG decoding', async () => {
  assert.equal(typeof globalThis.document, 'undefined')
  const svg = figure({ width: 1600, height: 1480, title: 'Pure SVG report', columns: 3, gap: 32 })
    .bar({ categories: ['A', 'B'], series: [{ values: [20, 40] }], yAxis: true })
    .line({ x: [0, 1, 2], series: [{ y: [4, 8, 6] }], yAxis: true })
    .scatter({ points: [{ x: 1, y: 3 }, { x: 2, y: 7 }], yAxis: true })
    .heatmap({ data: [[1, 4], [3, 9]], xLabels: ['A', 'B'], yLabels: ['Alpha', 'Beta'] })
    .waterfall({ categories: ['Start', 'Gain', 'Loss'], values: [20, 10, -5] })
    .donut({ items: [{ name: 'Alpha', value: 55 }, { name: 'Beta', value: 45 }] })
    .radar({ axes: ['Quality', 'Speed', 'Value'].map(name => ({ name, max: 10 })), series: [{ values: [8, 6, 9] }] })
    .gauge({ value: 72, max: 100, unit: '%' })
    .slope({ leftTitle: 'Before', rightTitle: 'After', items: [{ name: 'Alpha', left: 20, right: 45 }] })
    .pyramid({ layers: [{ name: 'Visitors', value: 100 }, { name: 'Customers', value: 35 }] })
    .render()
  assert.doesNotMatch(svg, /NaN|Infinity/)
  save('plot-ts-svg-gallery.svg', svg)
  // loadImage SVG support is an optional capability of node-canvas's build,
  // not a dependency or promised output format of plot-ts's pure SVG entry.
  assert.ok(canvas.rsvgVersion, 'this extra integration check requires librsvg')
  const surface = await decoded(Buffer.from(svg), 1600, 1480)
  const copy = await png('plot-ts-svg-gallery', surface)
  assert.ok(countAlpha(copy).painted > 20_000)
})

test('pure SVG normal validation errors remain explicit with native dependencies present', () => {
  assert.throws(() => figure({ width: 0 }), { name: 'RangeError' })
  assert.throws(() => figure().donut({ items: [{ name: 'A', value: -1 }] }).render(), { name: 'RangeError', message: 'Donut values must be non-negative' })
  assert.throws(() => figure().line({ x: [-1e308, 1e308], series: [{ y: [1, 2] }] }).render(), { name: 'RangeError' })
  assert.doesNotMatch(figure().gauge({ value: 0 }).render(), /NaN|Infinity/)
})
