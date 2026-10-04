/** Opt-in native alpha verification, not browser acceptance.
 * npm run build && node --import tsx --test tests/native-svg-surface-policy.test.mjs
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme, SURFACE_POLICIES } from '../dist/svg.js'
import { addAllSvgCharts } from './fixtures/canonical-charts.ts'
import { checkStylesheet } from './helpers/html-document.ts'

const require = createRequire(import.meta.url)
const canvas = require('canvas')
const { createCanvas, loadImage } = canvas
const evidenceDir = process.env.PLOT_TS_SURFACE_EVIDENCE_DIR
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true })
const artifacts = [], measurements = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function save(name, bytes) {
  if (!evidenceDir) return
  writeFileSync(join(evidenceDir, name), bytes)
  artifacts.push({ name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) })
}
function rgba(surface, x, y) { return [...surface.getContext('2d').getImageData(x, y, 1, 1).data] }
function alpha(surface) {
  const pixels = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data
  let clear = 0, translucent = 0, opaque = 0
  for (let i = 3; i < pixels.length; i += 4) {
    if (!pixels[i]) clear++
    else if (pixels[i] === 255) opaque++
    else translucent++
  }
  return { clear, translucent, opaque, painted: translucent + opaque }
}
async function decode(svg, width, height) {
  const image = await loadImage(Buffer.from(svg))
  assert.equal(image.width, width); assert.equal(image.height, height)
  const surface = createCanvas(width, height)
  surface.getContext('2d').drawImage(image, 0, 0)
  return surface
}
after(() => {
  save('measurements.json', JSON.stringify({
    versions: { node: process.version, canvas: canvas.version, rsvg: canvas.rsvgVersion, cairo: canvas.cairoVersion },
    bundle: { path: 'dist/svg.js', sha256: hash(readFileSync('dist/svg.js')) },
    nativeBinding: { sha256: hash(readFileSync('node_modules/canvas/build/Release/canvas.node')) },
    browserAcceptance: false, measurements,
  }, null, 2) + '\n')
  save('artifact-manifest.json', JSON.stringify({ artifacts }, null, 2) + '\n')
})

const cases = [
  ['default', {}],
  ...['cyan', 'teal', 'electric', 'bcg'].map(accent => ['accent-' + accent, { accent }]),
  ...CANONICAL_THEME_NAMES.map(theme => [theme, { theme }]),
]
for (const [name, options] of cases) {
  for (const policy of SURFACE_POLICIES) {
    test(`${name}/${policy}: SVG root alpha, semantic marks and valid HTML`, async () => {
      assert.equal(typeof globalThis.document, 'undefined')
      assert.equal(typeof globalThis.window, 'undefined')
      assert.ok(canvas.rsvgVersion)
      const report = addAllSvgCharts(figure({ ...options, surfacePolicy: policy, width: 1600, height: 1480, columns: 3, gap: 32, title: name }))
      const svg = report.render(), html = report.renderHtml()
      checkStylesheet(html)
      const surface = await decode(svg, 1600, 1480)
      const counts = alpha(surface)
      const shouldBeClear = policy !== 'themed-v1' || !options.theme
      assert.equal(rgba(surface, 1599, 1479)[3], shouldBeClear ? 0 : 255)
      assert.ok(counts.painted > 20000, 'actual semantic marks remain painted')
      if (shouldBeClear) assert.ok(counts.clear > 10000 && counts.translucent > 0)
      else assert.equal(counts.opaque, 1600 * 1480)
      const png = surface.toBuffer('image/png')
      const roundTrip = await loadImage(png)
      assert.equal(roundTrip.width, 1600); assert.equal(roundTrip.height, 1480)
      const prefix = `${name}-${policy}`
      save(prefix + '.svg', svg); save(prefix + '.html', html); save(prefix + '.png', png)
      measurements.push({ name, policy, ...counts, sha256: hash(png) })
      if (policy === 'transparent-auto-v1' && (name === 'sage' || name === 'sage-dark')) {
        for (const [hostName, color] of [['light-host', '#ffffff'], ['dark-host', '#101820']]) {
          const preview = createCanvas(1600, 1480), ctx = preview.getContext('2d')
          ctx.fillStyle = color; ctx.fillRect(0, 0, 1600, 1480); ctx.drawImage(surface, 0, 0)
          save(`${prefix}-${hostName}-preview.png`, preview.toBuffer('image/png'))
        }
      }
    })
  }
}

for (const theme of ['sage', 'sage-dark']) {
  test(`${theme}: paper-colored authored gauge band remains painted over a clear root`, async () => {
    const color = getCanonicalTheme(theme).tokens['--paper']
    const svg = figure({ theme, surfacePolicy: 'transparent-auto-v1', width: 400, height: 300 })
      .gauge({ value: 60, max: 100, bands: [{ from: 0, to: 100, color }] }).render()
    assert.ok(svg.includes(`fill="${color}" opacity="0.8"`))
    const surface = await decode(svg, 400, 300)
    assert.equal(rgba(surface, 399, 299)[3], 0)
    assert.ok(alpha(surface).translucent > 10000, 'semantic band with its authored alpha survives')
    save(`${theme}-authored-band.svg`, svg)
    save(`${theme}-authored-band.png`, surface.toBuffer('image/png'))
  })
}
