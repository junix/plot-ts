import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { figure, type HeatmapChart } from '../src/svg/index.js';

type Config = Omit<HeatmapChart, 'type'>;
function render(config: Config, width = 300, height = 200): string {
  return figure({ width, height }).heatmap(config).render();
}
function cells(output: string): string[] {
  return [...output.matchAll(/<rect\b[^>]*\/>/g)].map(m => m[0]);
}
function texts(output: string): string[] {
  return [...output.matchAll(/<text\b[^>]*>.*?<\/text>/g)].map(m => m[0]);
}
const data = [[1, 2], [3, 4]];

test('X labels render centered below their columns inside the reserved margin', () => {
  const output = render({ data, xLabels: ['A', 'B'] });
  assert.deepEqual(texts(output), [
    '<text x="80" y="192" text-anchor="middle" fill="rgba(5, 28, 44, 0.58)" style="font-size:10px;font-weight:400px">A</text>',
    '<text x="220" y="192" text-anchor="middle" fill="rgba(5, 28, 44, 0.58)" style="font-size:10px;font-weight:400px">B</text>',
  ]);
  assert.match(cells(output)[0]!, /x="10" y="2" width="140" height="87"/);
});

test('X labels preserve data cells and all Y-label output', () => {
  const config = { data, yLabels: ['one', 'three'] };
  const output = render({ ...config, xLabels: ['A', 'B'] });
  const reserved = render({ ...config, xLabels: [] });
  assert.deepEqual(cells(output), cells(reserved));
  assert.deepEqual(texts(output).slice(0, 2), texts(reserved));
  assert.match(texts(output)[2]!, /x="106.25" y="192" text-anchor="middle"/);
  assert.match(texts(output)[3]!, /x="228.75" y="192" text-anchor="middle"/);
});

test('X label text is escaped rather than interpreted as SVG', () => {
  const output = render({ data, xLabels: ['A & <B>', '"Q" \'S\' <script>alert(1)</script>'] });
  assert.match(output, />A &amp; &lt;B&gt;<\/text>/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(output, /<script\b|<B>/);
  assert.equal(texts(output).length, 2);
});

test('extra X labels have no columns and are ignored', () => {
  const config = { data, xLabels: ['A', 'B'] };
  assert.equal(render({ ...config, xLabels: ['A', 'B', 'outside'] }), render(config));
  assert.equal(texts(render(config)).length, 2);
});

test('missing X labels leave the remaining columns unlabeled', () => {
  const output = render({ data, xLabels: ['first'] });
  assert.equal(texts(output).length, 1);
  assert.match(texts(output)[0]!, /x="80".*>first<\/text>/);
  assert.equal(cells(output).length, 4);
});

test('empty strings remain valid centered labels', () => {
  const output = render({ data, xLabels: ['', 'B'] });
  assert.equal(texts(output).length, 2);
  assert.match(texts(output)[0]!, /x="80".*><\/text>/);
  assert.match(texts(output)[1]!, />B<\/text>/);
});

for (const value of [0, -3, 2.7]) {
  test(`singleton ${value} label uses the cell center and keeps constant fill`, () => {
    const output = render({ data: [[value]], xLabels: ['only'] });
    assert.match(texts(output)[0]!, /x="150" y="192".*>only<\/text>/);
    assert.match(cells(output)[0]!, /fill="#26838e"/);
    assert.doesNotMatch(output, /NaN|Infinity|undefined/);
  });
}

for (const [width, height] of [[160, 120], [640, 360], [500, 800]]) {
  test(`column labels stay centered at ${width}x${height}`, () => {
    const output = render({ data: [[0, 1]], xLabels: ['L', 'R'] }, width, height);
    const x = 10 + (width! - 20) / 4;
    assert.match(texts(output)[0]!, new RegExp(`x="${x}" y="${height! - 8}"`));
    assert.match(texts(output)[1]!, new RegExp(`x="${width! - x}" y="${height! - 8}"`));
    assert.doesNotMatch(output, /NaN|Infinity|undefined/);
  });
}

test('X labels render in titled grid panels in local coordinates', () => {
  const config = { data, xLabels: ['A', 'B'] };
  const output = figure({ width: 616, height: 240, columns: 2, gap: 16, title: 'Columns' })
    .heatmap(config).heatmap(config).render();
  assert.match(output, /transform="translate\(0, 40\)"/);
  assert.match(output, /data-panel-index="1" data-chart-type="heatmap" transform="translate\(316, 0\)"/);
  assert.equal(texts(output).filter(t => t.includes('y="192"')).length, 4);
});

for (const empty of [[], [[]]]) {
  test(`empty data ${JSON.stringify(empty)} still suppresses X labels`, () => {
    assert.equal(render({ data: empty, xLabels: ['unused'] }), render({ data: empty }));
    assert.equal(texts(render({ data: empty, xLabels: ['unused'] })).length, 0);
  });
}

test('omitted X labels preserve the published default output byte-for-byte', () => {
  assert.equal(createHash('sha256').update(render({ data })).digest('hex'),
    'b089fdbdd4a3fd65574bb09c0adc2ce40e2031ea1abbe11f197876c67286bfda');
});

test('empty X labels retain the existing reserved margin without text', () => {
  const output = render({ data, xLabels: [] });
  assert.equal(texts(output).length, 0);
  assert.match(cells(output)[0]!, /x="10" y="2" width="140" height="87"/);
});
