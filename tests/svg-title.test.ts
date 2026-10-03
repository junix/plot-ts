import assert from 'node:assert/strict';
import test from 'node:test';
import { figure } from '../src/svg/index.js';

function chart(title?: string) {
  return figure({ title }).bar({
    categories: ['A', 'B'],
    series: [{ values: [10, 20] }],
  });
}

test('render treats a figure title as SVG text, not markup', () => {
  const title = '</text><script>alert("title")</script><text>';
  const output = chart(title).render();

  assert.ok(output.includes('&lt;/text&gt;&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;&lt;text&gt;</text>'));
  assert.ok(!output.includes('<script>'));
  assert.ok(output.includes('<rect '), 'chart shapes must remain SVG markup');
});

test('renderHtml escapes title-closing markup in the document title', () => {
  const title = '</title><script>alert("title")</script>';
  const output = figure({ title }).renderHtml();

  assert.ok(output.includes('<title>&lt;/title&gt;&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;</title>'));
  assert.ok(!output.includes('<script>'));
  assert.equal(output.match(/<\/title>/g)?.length, 1);
});

test('renderHtml escapes both title locations without double-escaping', () => {
  const output = chart('Sales & growth <2026> "forecast" \'估算\'').renderHtml();
  const escaped = 'Sales &amp; growth &lt;2026&gt; &quot;forecast&quot; &#39;估算&#39;';

  assert.ok(output.includes(`<title>${escaped}</title>`));
  assert.ok(output.includes(`>${escaped}</text>`));
  assert.ok(!output.includes('&amp;amp;'));
});

test('ordinary figure titles keep their text', () => {
  const output = chart('Quarterly sales 2026').renderHtml();

  assert.ok(output.includes('<title>Quarterly sales 2026</title>'));
  assert.ok(output.includes('>Quarterly sales 2026</text>'));
});

test('missing or empty figure titles keep the default document title', () => {
  for (const title of [undefined, '']) {
    const output = chart(title).renderHtml();
    assert.ok(output.includes('<title>plot-ts Chart</title>'));
    assert.ok(!output.includes('font-size="18"'), 'no figure title element is added');
  }
});
