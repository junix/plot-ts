import assert from 'node:assert/strict'
import { transformSync } from 'esbuild'

/** Narrow structural parser for this generated document, including HTML raw-text
 * handling for title/style. This is not a DOM shim or a browser acceptance test.
 */
export function parseDocument(html: string) {
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

export function checkStylesheet(html: string): string {
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

