import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type HeatmapChart } from '../src/svg/index.js';
import { esc } from '../src/util/html.js';

const long = 'Quarterly international operations across all product categories';
const data = [[1, 2], [3, 4]];
function render(config: Omit<HeatmapChart, 'type'>, width = 300, height = 200): string {
  return figure({ width, height }).heatmap(config).render();
}
function texts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g)].map(match => match[0]);
}
function content(text: string): string {
  return text.replace(/<title>[\s\S]*?<\/title>/, '').replace(/^<text\b[^>]*>|<\/text>$/g, '');
}
function attr(text: string, name: string): number {
  return Number(text.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);
}

test('long Y labels leave 60% of the available width for visible heatmap cells', () => {
  const svg = render({ data, yLabels: [long, long], xLabels: ['A', 'B'] });
  const cells = [...svg.matchAll(/<rect\b[^>]*\/>/g)].map(match => match[0]);
  assert.equal(cells.length, 4);
  assert.match(cells[0]!, /x="116" y="2" width="87" height="87"/);
  assert.match(cells[3]!, /x="203" y="89" width="87" height="87"/);
  for (const label of texts(svg).slice(0, 2)) {
    assert.match(label, /text-anchor="end"/);
    assert.ok(content(label).endsWith('…'));
    assert.ok(label.includes(`<title>${long}</title>`));
    assert.ok(attr(label, 'textLength') <= 108);
    assert.ok(attr(label, 'x') - attr(label, 'textLength') >= 4);
  }
});

test('long X labels use independent column budgets and retain full text', () => {
  const labels = texts(render({ data, xLabels: [long, long] }));
  assert.equal(labels.length, 2);
  for (const [index, label] of labels.entries()) {
    assert.equal(attr(label, 'x'), 80 + index * 140);
    assert.ok(attr(label, 'textLength') <= 132);
    assert.match(label, /lengthAdjust="spacingAndGlyphs"/);
    assert.ok(content(label).endsWith('…'));
    assert.ok(label.includes(`<title>${long}</title>`));
  }
});

test('surplus Y labels neither reserve space nor render without corresponding rows', () => {
  const config = { data, yLabels: ['A', 'B'] };
  assert.equal(render({ ...config, yLabels: ['A', 'B', long.repeat(100)] }), render(config));
  assert.equal(texts(render(config)).length, 2);
});

test('missing and empty labels preserve their positions without generated placeholders', () => {
  const svg = render({ data, yLabels: [''], xLabels: ['A'] });
  assert.equal(texts(svg).length, 2);
  assert.equal(content(texts(svg)[0]!), '');
  assert.equal(content(texts(svg)[1]!), 'A');
  assert.doesNotMatch(svg, /<title>|textLength/);
});

for (const data of [[], [[]], [[], []]]) {
  test(`empty rectangular data ${JSON.stringify(data)} suppresses all long labels`, () => {
    assert.equal(render({ data, xLabels: [long], yLabels: [long] }), render({ data }));
    assert.equal(texts(render({ data, xLabels: [long], yLabels: [long] })).length, 0);
  });
}

test('a one-cell chart fits both labels and preserves its constant fill', () => {
  const svg = render({ data: [[3]], xLabels: [long], yLabels: [long] }, 160, 120);
  assert.match(svg, /x="60" y="2" width="90" height="94" fill="#26838e"/);
  assert.equal(texts(svg).length, 2);
  assert.ok(texts(svg).every(label => content(label).endsWith('…')));
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

for (const label of ['😀'.repeat(50), '👩‍💻'.repeat(30), 'e\u0301'.repeat(50), '家庭与国际市场'.repeat(20)]) {
  test(`truncation preserves complete graphemes: ${label.slice(0, 12)}`, () => {
    const svg = render({ data: [[1]], xLabels: [label], yLabels: [label] }, 160, 120);
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(label)].map(s => s.segment);
    const prefixes = new Set(['']);
    let prefix = '';
    for (const segment of segments) { prefix += segment; prefixes.add(prefix); }
    for (const text of texts(svg)) {
      const visible = content(text);
      assert.ok(visible.endsWith('…'));
      assert.ok(prefixes.has(visible.slice(0, -1)), 'visible prefix must end at a grapheme boundary');
      assert.ok(text.includes(`<title>${esc(label)}</title>`));
      assert.ok(Array.from(visible).every(ch => {
        const code = ch.codePointAt(0)!;
        return code < 0xd800 || code > 0xdfff;
      }), 'visible text must not contain isolated surrogate halves');
    }
  });
}

test('visible text and full titles both escape markup and metacharacters', () => {
  const label = '<script>alert("& \'SVG\'")</script>'.repeat(10);
  const svg = render({ data: [[1]], xLabels: [label], yLabels: [label] }, 160, 120);
  assert.doesNotMatch(svg, /<script|<\/script>/);
  assert.equal((svg.match(/<title>/g) ?? []).length, 2);
  assert.ok(texts(svg).every(text => text.includes(`<title>${esc(label)}</title>`)));
});

for (const columns of [10, 20, 100]) {
  test(`${columns} narrow columns do not emit labels larger than their bands`, () => {
    const svg = render({ data: [Array.from({ length: columns }, (_, i) => i)], xLabels: Array(columns).fill(long) }, 160, 120);
    const budget = Math.max(0, 140 / columns - 8);
    assert.equal(texts(svg).length, columns);
    for (const label of texts(svg)) {
      assert.ok(label.includes(`<title>${long}</title>`));
      if (budget < 10) {
        assert.equal(content(label), '');
        assert.doesNotMatch(label, /textLength/);
      } else assert.ok(attr(label, 'textLength') <= budget + 0.01);
    }
    assert.doesNotMatch(svg, /NaN|Infinity/);
  });
}

test('an exact ellipsis budget shows one ellipsis while a smaller budget only retains its title', () => {
  for (const [width, expected] of [[37.99, ''], [38, '…'], [38.01, '…']] as const) {
    const svg = render({ data: [[1]], xLabels: [long] }, width, 120);
    assert.equal(content(texts(svg)[0]!), expected);
  }
});

test('labels at the estimated fit boundary retain their original text markup', () => {
  const fitting = texts(render({ data: [[1]], xLabels: ['AB'] }, 40, 120))[0]!;
  assert.equal(content(fitting), 'AB');
  assert.doesNotMatch(fitting, /<title>|textLength|lengthAdjust/);
  const overflow = texts(render({ data: [[1]], xLabels: ['AB'] }, 39.99, 120))[0]!;
  assert.equal(content(overflow), '…');
  assert.match(overflow, /<title>AB<\/title>/);
});

test('titled grid panels fit labels in local coordinates and remain deterministic', () => {
  const config = { data, yLabels: [long, long], xLabels: [long, long] };
  const saved = structuredClone(config);
  const f = figure({ width: 336, height: 160, columns: 2, gap: 16, title: 'Labels' }).heatmap(config).heatmap(config);
  const svg = f.render();
  assert.match(svg, /data-panel-index="1" data-chart-type="heatmap" transform="translate\(176, 0\)"/);
  assert.equal((svg.match(/<title>/g) ?? []).length, 8);
  assert.equal((svg.match(/x="60" y="2" width="45" height="47"/g) ?? []).length, 2);
  assert.equal(f.render(), svg);
  assert.ok(f.renderHtml().includes(svg));
  assert.deepEqual(config, saved);
});
