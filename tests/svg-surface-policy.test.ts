import { embeddedSvg, semanticMarks } from './helpers/svg-motion.js';
import test from 'node:test'
import assert from 'node:assert/strict'
import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme, SURFACE_POLICIES, SURFACE_POLICY_VERSION, parseSurfacePolicy, type SvgFigureOptions } from '../src/svg/index.js'
import { ACCENTS, palette, generateStyles, type AccentName } from '../src/style/tokens.js'
import { addAllSvgCharts } from './fixtures/canonical-charts.js'
import { checkStylesheet, parseDocument } from './helpers/html-document.js'

const cases: Array<[string, SvgFigureOptions]> = [
  ['default', {}],
  ...Object.keys(ACCENTS).map(accent => [`accent-${accent}`, { accent: accent as AccentName }] as [string, SvgFigureOptions]),
  ...CANONICAL_THEME_NAMES.map(theme => [theme, { theme }] as [string, SvgFigureOptions]),
]
const layout = { width: 1600, height: 1480, title: '</style><script>bad</script>&', columns: 3, gap: 32 }

function clearRoot(svg: string): string {
  return svg.replace(/<rect[^>]*data-plot-surface="paper"[^>]*\/>/, rect => rect.replace(/fill="[^"]*"/, 'fill="none"'))
}
function panelBackground(css: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped} \\{[^}]*background: ([^;]+);`))?.[1]
}

test('surface policy is an exact immutable versioned three-mode contract', () => {
  assert.equal(SURFACE_POLICY_VERSION, 'plot.surface-policy/v1')
  assert.deepEqual(SURFACE_POLICIES, ['themed-v1', 'transparent-root-v1', 'transparent-auto-v1'])
  assert.ok(Object.isFrozen(SURFACE_POLICIES))
  for (const policy of SURFACE_POLICIES) assert.equal(parseSurfacePolicy(policy), policy)
})

test('malformed policy values reject before any dimension/title options are read', () => {
  const invalid = [undefined, null, '', 'transparent', 'themed', 'THEMED-V1', ' themed-v1', 'transparent-auto-v2', '__proto__', {}, [], true, 1]
  for (const value of invalid) {
    assert.throws(() => parseSurfacePolicy(value), RangeError)
    if (value === undefined) continue // omission keeps the default
    let reads = 0
    const options = { surfacePolicy: value, get width() { reads++; throw new Error('effect') }, get title() { reads++; throw new Error('effect') } }
    assert.throws(() => figure(options as any), RangeError)
    assert.equal(reads, 0)
  }
  assert.equal(figure({ surfacePolicy: undefined }).render(), figure().render())
})

for (const [name, options] of cases) {
  test(`${name}: themed/default bytes and semantic marks/geometry are unchanged in every SVG policy`, () => {
    const base = addAllSvgCharts(figure({ ...layout, ...options })).render()
    for (const policy of SURFACE_POLICIES) {
      const svg = addAllSvgCharts(figure({ ...layout, ...options, surfacePolicy: policy })).render()
      assert.equal(svg, policy === 'themed-v1' ? base : clearRoot(base))
      assert.equal((svg.match(/data-plot-surface="paper"/g) ?? []).length, options.theme ? 1 : 0)
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/)
    }
  })
  test(`${name}: HTML distinguishes root and panel fills without changing tokens, CSS animation, or classes`, () => {
    const base = addAllSvgCharts(figure({ ...layout, ...options }))
    const baseHtml = base.renderHtml(), baseSvg = embeddedSvg(baseHtml)
    const baseCss = checkStylesheet(baseHtml)
    const paper = options.theme ? getCanonicalTheme(options.theme).tokens['--paper'] : undefined
    assert.equal(addAllSvgCharts(figure({ ...layout, ...options, surfacePolicy: 'themed-v1' })).renderHtml(), baseHtml)
    for (const policy of ['transparent-root-v1', 'transparent-auto-v1'] as const) {
      const chart = addAllSvgCharts(figure({ ...layout, ...options, surfacePolicy: policy }))
      const html = chart.renderHtml(), css = checkStylesheet(html)
      assert.equal(panelBackground(css, 'body'), 'transparent')
      assert.equal(panelBackground(css, '.chart-container'), policy === 'transparent-auto-v1' ? 'transparent' : (paper ?? 'white'))
      assert.equal(panelBackground(css, '.plt-chart'), policy === 'transparent-auto-v1' ? 'transparent' : 'var(--paper)')
      let expectedCss = baseCss.replace(`background: ${paper ?? '#f5f5f7'};`, 'background: transparent;')
      if (policy === 'transparent-auto-v1') {
        expectedCss = expectedCss.replace(`.chart-container { background: ${paper ?? 'white'};`, '.chart-container { background: transparent;')
          .replace('background: var(--paper);', 'background: transparent;')
      }
      assert.equal(css, expectedCss, 'only registered background declarations may change')
      assert.equal(html, baseHtml.replace(baseSvg, clearRoot(baseSvg)).replace(baseCss, expectedCss))
      assert.deepEqual(parseDocument(html).elements, parseDocument(baseHtml).elements)
      assert.ok(!parseDocument(html).elements.some(e => e.tag === 'script'))
      assert.deepEqual(semanticMarks(html), semanticMarks(chart.render()))
    }
  })
}

test('empty figures retain legacy absent root and canonical root geometry', () => {
  for (const policy of SURFACE_POLICIES) {
    assert.equal(figure({ surfacePolicy: policy }).render(), figure().render())
    const base = figure({ theme: 'sage-dark' }).render()
    assert.equal(figure({ theme: 'sage-dark', surfacePolicy: policy }).render(), policy === 'themed-v1' ? base : clearRoot(base))
  }
})

test('authored and theme-paper-colored semantic fills are never inferred to be surfaces', () => {
  for (const theme of CANONICAL_THEME_NAMES) {
    const colors = getCanonicalTheme(theme)
    const bands = [
      { from: 0, to: 40, color: colors.tokens['--paper'] },
      { from: 40, to: 80, color: '#FFFFFF' },
      { from: 80, to: 100, color: 'transparent' },
    ]
    const base = figure({ theme }).gauge({ value: 50, max: 100, bands }).render()
    const svg = figure({ theme, surfacePolicy: 'transparent-auto-v1' }).gauge({ value: 50, max: 100, bands }).render()
    assert.equal(svg, clearRoot(base))
    for (const band of bands) assert.ok(svg.includes(`fill="${band.color}" opacity="0.8"`))
    assert.equal(getCanonicalTheme(theme), colors)
  }
  const legacyStyles = generateStyles(palette())
  figure({ surfacePolicy: 'transparent-auto-v1' }).renderHtml()
  assert.equal(generateStyles(palette()), legacyStyles, 'standalone/global style defaults are not changed')
})
