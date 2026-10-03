import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type HeatmapChart } from '../src/svg/index.js';

function render(config: Omit<HeatmapChart, 'type'>): string {
  return figure({ width: 300, height: 200 }).heatmap(config).render();
}

function cells(output: string): string[] {
  return [...output.matchAll(/<rect\b[^>]*>/g)].map(match => match[0]);
}

function fills(output: string): Array<string | undefined> {
  return cells(output).map(cell => cell.match(/\bfill="([^"]+)"/)?.[1]);
}

for (const value of [2, 0, -2, 3.7]) {
  test(`singleton heatmap ${value} uses the palette midpoint`, () => {
    const output = render({ data: [[value]] });
    assert.ok(!/NaN|Infinity/.test(output));
    assert.deepEqual(fills(output), ['#26838e']);
    assert.ok(cells(output)[0]!.includes('x="10" y="2" width="280" height="196"'));
  });

  test(`uniform matrix ${value} colors every cell identically`, () => {
    const output = render({ data: [[value, value, value], [value, value, value]] });
    assert.ok(!/NaN|Infinity/.test(output));
    assert.deepEqual(fills(output), Array<string>(6).fill('#26838e'));
  });
}

test('uniform labelled heatmap preserves labels and cell geometry', () => {
  const output = render({ data: [[5, 5], [5, 5]], xLabels: ['A', 'B'], yLabels: ['one', 'two'] });
  assert.deepEqual(fills(output), Array<string>(4).fill('#26838e'));
  assert.ok(cells(output)[0]!.includes('x="31" y="2" width="129.5" height="87"'));
  assert.match(output, />one<\/text>/);
  assert.match(output, />two<\/text>/);
});

test('ordinary heatmap keeps its palette range and intermediate colors', () => {
  assert.deepEqual(fills(render({ data: [[1, 2, 3]] })), ['#440154', '#26838e', '#fde725']);
  assert.deepEqual(fills(render({ data: [[-4, -3, -2], [-1, 0, 1], [2, 3, 4]] })), [
    '#440154', '#482878', '#3e4a89', '#31688e', '#26838e', '#1f9d8a', '#6cce5a', '#b6de2b', '#fde725',
  ]);
});

for (const data of [[], [[]]]) {
  test('empty heatmap still renders no cells', () => {
    assert.deepEqual(cells(render({ data })), []);
  });
}
