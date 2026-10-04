import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDocument, checkStylesheet } from './helpers/html-document.js'
import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme, type SvgFigureOptions } from '../src/svg/index.js'
import { esc } from '../src/util/html.js'
import { ACCENTS, generateStyles, palette, type AccentName } from '../src/style/tokens.js'

const cases: Array<[string, SvgFigureOptions]> = [
  ['default', {}],
  ...Object.keys(ACCENTS).map(accent => [`accent-${accent}`, { accent: accent as AccentName }] as [string, SvgFigureOptions]),
  ...CANONICAL_THEME_NAMES.map(theme => [theme, { theme }] as [string, SvgFigureOptions]),
]
const hostileTitle = '</title></style><script>alert("x")</script>&\' " < >'

for (const [name, options] of cases) {
  for (const title of ['Ordinary chart', hostileTitle]) {
    test(`${name}: ${title === hostileTitle ? 'hostile' : 'ordinary'} title produces one structurally valid stylesheet`, () => {
      const chart = figure({ ...options, title }).bar({ categories: ['A'], series: [{ values: [2] }] })
      const html = chart.renderHtml()
      const css = checkStylesheet(html)
      const parsed = parseDocument(html)
      assert.deepEqual(parsed.titles, [esc(title)])
      assert.ok(!parsed.elements.some(e => ['script', 'iframe'].includes(e.tag)))
      assert.ok(html.includes(chart.render()), 'SVG source remains verbatim in the HTML')
      const theme = options.theme ? getCanonicalTheme(options.theme) : undefined
      const colors = theme ? {
        ink: theme.tokens['--ink'], accent: theme.tokens['--accent'],
        paper: theme.tokens['--paper'], neutral: theme.tokens['--grid'],
      } : palette(options.accent)
      const originalRules = generateStyles(colors).slice('<style>'.length, -'</style>'.length)
      assert.ok(css.includes(originalRules), 'all palette and animation rules are retained byte-for-byte')
      assert.ok(css.includes(`body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: ${theme?.tokens['--paper'] ?? '#f5f5f7'}; }`))
      assert.ok(css.includes(`.chart-container { background: ${theme?.tokens['--paper'] ?? 'white'};`))
    })
  }
}

test('the regression parser rejects the original nested style defect', () => {
  const valid = figure().bar({ categories: ['A'], series: [{ values: [2] }] }).renderHtml()
  const styles = generateStyles(palette())
  const broken = valid.replace(styles.slice('<style>'.length, -'</style>'.length), styles)
  assert.throws(() => checkStylesheet(broken), /unbalanced|stylesheet/)
})

test('CSS validation rejects malformed rules even with valid document nesting', () => {
  const html = figure().renderHtml().replace('body {', 'body { <style>')
  assert.throws(() => checkStylesheet(html), /stylesheet/)
})
