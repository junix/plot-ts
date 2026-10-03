import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { figure, type HeatmapChart } from '../src/svg/index.js';

function render(config: Omit<HeatmapChart, 'type'>): string {
  return figure({ width: 300, height: 200 }).heatmap(config).render();
}

function cells(output: string): string[] {
  return [...output.matchAll(/<rect\b[^>]*>/g)].map(match => match[0]);
}

for (const [name, data] of [
  ['singleton', [[3]]],
  ['row', [[-1, 0, 2]]],
  ['matrix', [[1, 2], [3, 4]]],
] as const) {
  test(`empty Y labels match omitted labels for a ${name}`, () => {
    const config = { data: data.map(row => [...row]) };
    const output = render({ ...config, yLabels: [] });
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.equal(output, render(config));
    assert.equal(cells(output).length, data.length * data[0].length);
    assert.match(cells(output)[0]!, /x="10" y="2"/);
    assert.doesNotMatch(output, /<text\b/);
  });
}

for (const value of [0, 2, -2, 3.7]) {
  test(`empty Y labels preserve constant ${value} heatmap cells`, () => {
    const data = [[value, value], [value, value]];
    const output = render({ data, yLabels: [] });
    assert.equal(output, render({ data }));
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.equal(cells(output).length, 4);
    assert.ok(cells(output).every(cell => cell.includes('fill="#26838e"')));
    assert.match(cells(output)[0]!, /x="10" y="2" width="140" height="98"/);
  });
}

for (const xLabels of [[], ['A', 'B']]) {
  test(`empty Y labels preserve X-label layout for ${JSON.stringify(xLabels)}`, () => {
    const config = { data: [[1, 2], [3, 4]], xLabels };
    const output = render({ ...config, yLabels: [] });
    assert.equal(output, render(config));
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.match(cells(output)[0]!, /x="10" y="2" width="140" height="87"/);
  });
}

test('empty Y labels preserve titled grids with a normal labelled neighbor', () => {
  const config = { data: [[1, 2], [3, 4]], xLabels: ['A', 'B'] };
  const options = { width: 616, height: 240, columns: 2, gap: 16, title: 'Heat & <light>' };
  const neighbor = { data: [[5, 5], [5, 5]], yLabels: ['one', 'three'] };
  const output = figure(options).heatmap({ ...config, yLabels: [] }).heatmap(neighbor).render();
  assert.equal(output, figure(options).heatmap(config).heatmap(neighbor).render());
  assert.doesNotMatch(output, /NaN|Infinity/);
  assert.match(output, /Heat &amp; &lt;light&gt;/);
  assert.match(output, /transform="translate\(0, 40\)"/);
  assert.match(output, /data-panel-index="1" data-chart-type="heatmap" transform="translate\(316, 0\)"/);
  assert.equal(cells(output).length, 8);
  assert.match(cells(output)[0]!, /x="10" y="2" width="140" height="87"/);
  assert.match(cells(output)[4]!, /x="45" y="2" width="122.5" height="98"/);
});

// Digests from the published 12d3e7d baseline. Exclude newly rendered X text
// when checking the original cells and Y labels; their bytes remain unchanged.
for (const [name, labels, expected] of [
  ['omitted labels', {}, 'b089fdbdd4a3fd65574bb09c0adc2ce40e2031ea1abbe11f197876c67286bfda'],
  ['nonempty labels', { xLabels: ['A', 'B'], yLabels: ['one', 'three'] }, 'a7fc3c96f074cb6e34df36e14a7a69707030cbfcb0ca8292376c04c9605faf83'],
  ['empty-string labels', { yLabels: ['', ''] }, 'a8673283f4fa3f2e605a29a0cdce4333ea5581b04ade0895d744e519c1ea94ba'],
] as const) {
  test(`${name} keep byte-identical original cells and Y labels`, () => {
    const config = { data: [[1, 2], [3, 4]], ...labels };
    const output = render({
      data: config.data,
      ...('xLabels' in config ? { xLabels: [...config.xLabels] } : {}),
      ...('yLabels' in config ? { yLabels: [...config.yLabels] } : {}),
    });
    const originalOutput = 'xLabels' in config
      ? output.replace(/<text\b[^>]*text-anchor="middle"[^>]*>.*?<\/text>/g, '')
      : output;
    assert.equal(createHash('sha256').update(originalOutput).digest('hex'), expected);
  });
}

for (const data of [[], [[]]]) {
  test(`empty Y labels preserve empty data ${JSON.stringify(data)}`, () => {
    const output = render({ data, yLabels: [] });
    assert.equal(output, render({ data }));
    assert.deepEqual(cells(output), []);
    assert.doesNotMatch(output, /NaN|Infinity/);
  });
}
