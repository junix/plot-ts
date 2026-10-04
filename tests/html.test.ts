import assert from 'node:assert/strict';
import test from 'node:test';
import { attrs, esc, h, rich, text } from '../src/util/html.js';

test('esc encodes text metacharacters and treats absent values as empty', () => {
  assert.equal(esc(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('attrs escapes values and omits absent and false attributes', () => {
  assert.equal(attrs({ title: '"<&', hidden: true, disabled: false, empty: null }),
    ' title="&quot;&lt;&amp;" hidden');
});

test('SVG leaf elements self-close while text content is escaped', () => {
  assert.equal(h('rect', { width: 12 }), '<rect width="12" />');
  assert.ok(text(10, 20, '<script>alert("test")</script>')
    .includes('&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;'));
});

test('rich only expands supported formatting after escaping input', () => {
  assert.equal(rich('**bold** <img src=x onerror=alert(1)>'),
    '<b>bold</b> &lt;img src=x onerror=alert(1)&gt;');
});

test('fitted SVG text escapes its full title and sets an explicit advance width', () => {
  const output = text(10, 20, 'Long…', { title: '<Long & full>', textLength: 33.123 });
  assert.match(output, /textLength="33.12" lengthAdjust="spacingAndGlyphs"/);
  assert.match(output, /<title>&lt;Long &amp; full&gt;<\/title>Long…<\/text>/);
  assert.doesNotMatch(text(10, 20, 'Short'), /<title>|textLength|lengthAdjust/);
});
