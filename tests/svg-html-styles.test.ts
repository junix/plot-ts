import test from 'node:test'
import assert from 'node:assert/strict'
import { transformSync } from 'esbuild'
import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme, type SvgFigureOptions } from '../src/svg/index.js'
import { esc } from '../src/util/html.js'
import { ACCENTS, generateStyles, palette, type AccentName } from '../src/style/tokens.js'

/** Narrow structural parser for this generated document, including HTML raw-text
 * handling for title/style. This is not a DOM shim or a browser acceptance test.
 */
function parseDocument(html: string) {
  const stack: string[] = []
  const elements: Array<{ tag: string; parent: string | undefined }> = []
  const styles: string[] = []
  const titles: string[] = []
  const tags = /<\/?([a-z][a-z0-9:-]*)(?:\s[^<>]*?)?\s*\/?>/gi
  const voidTags = new Set(['meta', 'link', 'br', 'hr', 'img', 'input'])
  let match: RegExpExecArray | null
  while ((match = tags.exec(html))) {
    const tag = match[1]!.toLowerCase()
    if (match[0].startsWith('</')) {
      assert.equal(stack.pop(), tag, `unbalanced </${tag}>`)
      continue
    }
    elements.push({ tag, parent: stack.at(-1) })
    if (match[0].endsWith('/>') || voidTags.has(tag)) continue
    stack.push(tag)
    if (tag === 'title' || tag === 'style') {
      const end = html.indexOf(`</${tag}>`, tags.lastIndex)
      assert.ok(end >= 0, `unclosed <${tag}>`)
      const raw = html.slice(tags.lastIndex, end)
      if (tag === 'style') styles.push(raw)
      else if (stack.at(-2) === 'head') titles.push(raw)
      tags.lastIndex = end
    }
  }
  assert.deepEqual(stack, [], 'all generated elements close')
  return { elements, styles, titles }
}

function checkStylesheet(html: string): string {
  const document = parseDocument(html)
  assert.deepEqual(document.elements.filter(e => e.tag === 'style'), [{ tag: 'style', parent: 'head' }])
  assert.equal(document.styles.length, 1)
  const css = document.styles[0]!
  // Use the existing declared CSS parser, not a substring-only syntax check.
  const parsed = transformSync(css, { loader: 'css', logLevel: 'silent' })
  assert.deepEqual(parsed.warnings, [], 'stylesheet must parse without recovery warnings')
  assert.ok(parsed.code.includes(':root'))
  return css
}

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
