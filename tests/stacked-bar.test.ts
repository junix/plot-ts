import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type ColumnChart } from '../src/svg/index.js';

type Config = Omit<ColumnChart, 'type'>;
type Mark = { index: number; x: number; y: number; width: number; height: number; fill: string };

function render(config: Config): string {
  return figure({ width: 800, height: 500 }).bar(config).render();
}

function marks(output: string): Mark[] {
  assert.doesNotMatch(output, /NaN|Infinity/);
  return [...output.matchAll(/<rect\b[^>]*class="plt-grow"[^>]*>/g)].map(([tag]) => {
    const attr = (name: string): string => {
      const value = tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
      assert.notEqual(value, undefined, tag);
      return value!;
    };
    return {
      index: Number(attr('style').split(':')[1]),
      x: Number(attr('x')), y: Number(attr('y')),
      width: Number(attr('width')), height: Number(attr('height')), fill: attr('fill'),
    };
  });
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 0.011, `${actual} != ${expected}`);
}

function checkStack(config: Config, min: number, max: number, ranges: Array<[number, number, number]>): Mark[] {
  const output = render({ ...config, stacked: true, labels: false });
  const result = marks(output);
  const y = (v: number): number => 476 - (v - min) * 468 / (max - min);
  const baseline = output.match(/<line\b[^>]*y1="([^"]+)"[^>]*stroke-opacity="0.16"/);
  assert.ok(baseline, output);
  close(Number(baseline[1]), y(0));
  assert.equal(result.length, ranges.length);
  ranges.forEach(([index, low, high], i) => {
    const mark = result[i]!;
    assert.equal(mark.index, index);
    close(mark.y, y(high));
    close(mark.height, Math.max(0.5, y(low) - y(high)));
    assert.ok([mark.x, mark.y, mark.width, mark.height].every(Number.isFinite));
    assert.ok(mark.width > 0 && mark.height > 0);
    assert.ok(mark.x >= 0 && mark.x + mark.width <= 800);
    assert.ok(mark.y >= 8 - 0.011 && mark.y + mark.height <= 476.511);
    // Retain the existing half-pixel minimum for zero-valued marks.
    if (low !== high) {
      const value = config.series[index % config.series.length]!.values[Math.floor(index / config.series.length)]!;
      if (value > 0) assert.ok(mark.y + mark.height <= y(0) + 0.021);
      else assert.ok(mark.y >= y(0) - 0.011);
      close(mark.height / Math.abs(value), 468 / (max - min));
    }
  });
  return result;
}

test('negative stacks include the negative total and grow down from zero', () => {
  const result = checkStack({ categories: ['A'], series: [{ values: [-10] }, { values: [-20] }], yAxis: true }, -30, 0, [
    [0, -10, 0], [1, -30, -10],
  ]);
  assert.deepEqual(result.map(({ y, height, fill }) => ({ y, height, fill })), [
    { y: 8, height: 156, fill: '#051C2C' },
    { y: 164, height: 312, fill: '#00A9F0' },
  ]);
});

for (const yAxis of [false, true]) {
  test(`mixed signs meet at zero without overlap (axis=${yAxis})`, () => {
    const result = checkStack({ categories: ['A'], series: [{ values: [10] }, { values: [-5] }], yAxis }, -5, 10, [
      [0, 0, 10], [1, -5, 0],
    ]);
    close(result[0]!.y + result[0]!.height, result[1]!.y);
  });
  test(`negative-first mixed series still separate at zero (axis=${yAxis})`, () => {
    checkStack({ categories: ['A'], series: [{ values: [-5] }, { values: [10] }], yAxis }, -5, 10, [
      [0, -5, 0], [1, 0, 10],
    ]);
  });
}

test('interleaved signed series retain top-to-bottom order on each side', () => {
  const result = checkStack({ categories: ['A'], series: [10, -5, 20, -15].map(v => ({ values: [v] })), yAxis: true }, -20, 32, [
    [0, 20, 30], [1, -5, 0], [2, 0, 20], [3, -20, -5],
  ]);
  close(result[0]!.y + result[0]!.height, result[2]!.y);
  close(result[1]!.y + result[1]!.height, result[3]!.y);
});

test('every category uses its own signed totals with one shared scale', () => {
  checkStack({ categories: ['A', 'B', 'C'], series: [
    { values: [10, -5, 0] }, { values: [20, -15, null] },
    { values: [-3, 4, 0] }, { values: [-7, 6, -8] },
  ], yAxis: true }, -20, 32, [
    [0, 20, 30], [1, 0, 20], [2, -3, 0], [3, -10, -3],
    [4, -5, 0], [5, -20, -5], [6, 6, 10], [7, 0, 6],
    [8, 0, 0], [10, 0, 0], [11, -8, 0],
  ]);
});

test('fractional signed values share one scale without cancellation', () => {
  checkStack({ categories: ['A'], series: [0.1, -0.2, 0.2, -0.3].map(v => ({ values: [v] })) }, -0.5, 0.3, [
    [0, 0.2, 0.3], [1, -0.2, 0], [2, 0, 0.2], [3, -0.5, -0.2],
  ]);
});

test('null, missing and nonfinite values retain omission and original series indices', () => {
  const result = checkStack({ categories: ['A', 'B'], series: [
    { values: [10, Infinity] }, { values: [-5, NaN] }, { values: [null, -8] }, { values: [] },
  ] }, -8, 10, [[0, 0, 10], [1, -5, 0], [6, -8, 0]]);
  assert.deepEqual(result.map(mark => mark.fill), ['#051C2C', '#00A9F0', '#E6E8EA']);
});

test('values beyond categories do not change stacked marks or domain', () => {
  const clean: Config = { categories: ['A'], stacked: true, series: [{ values: [10] }, { values: [-5] }] };
  assert.equal(render({ ...clean, series: [{ values: [10, -999] }, { values: [-5, 999] }] }), render(clean));
});

test('all-zero stacks retain finite half-pixel marks with a nondegenerate domain', () => {
  checkStack({ categories: ['A', 'B'], series: [{ values: [0, 0] }, { values: [-0, null] }], yAxis: true }, 0, 1, [
    [0, 0, 0], [1, 0, 0], [2, 0, 0],
  ]);
});

test('all-negative categories have an independent zero baseline and shared minimum', () => {
  checkStack({ categories: ['A', 'B'], series: [{ values: [-10, -2] }, { values: [-20, -3] }] }, -30, 0, [
    [0, -10, 0], [1, -30, -10], [2, -2, 0], [3, -5, -2],
  ]);
});

test('explicit positive max remains authoritative above the positive total', () => {
  checkStack({ categories: ['A'], series: [{ values: [10] }, { values: [-5] }], max: 20 }, -5, 20, [
    [0, 0, 10], [1, -5, 0],
  ]);
});

test('explicit max below a total preserves the existing extrapolation behavior', () => {
  const result = marks(render({ categories: ['A'], series: [{ values: [10] }, { values: [-5] }], stacked: true, labels: false, max: 5 }));
  assert.deepEqual(result.map(({ y, height }) => ({ y, height })), [{ y: -226, height: 468 }, { y: 242, height: 234 }]);
});

for (const config of [
  { categories: [], series: [] },
  { categories: ['A'], series: [] },
  { categories: ['A'], series: [{ values: [null] }, { values: [Infinity] }] },
] satisfies Config[]) {
  test('empty stacked data renders finite output without marks', () => {
    assert.deepEqual(marks(render({ ...config, stacked: true, yAxis: true })), []);
  });
}

test('ordinary positive stacks retain exact mark geometry and series order', () => {
  const result = marks(render({ categories: ['A'], series: [{ values: [10] }, { values: [20] }], stacked: true, yAxis: true, labels: false }));
  assert.deepEqual(result, [
    { index: 0, x: 379, y: 37.25, width: 64, height: 146.25, fill: '#051C2C' },
    { index: 1, x: 379, y: 183.5, width: 64, height: 292.5, fill: '#00A9F0' },
  ]);
});

test('grouped mixed bars retain exact mark geometry', () => {
  const result = marks(render({ categories: ['A'], series: [{ values: [10] }, { values: [-5] }], yAxis: true, labels: false }));
  assert.deepEqual(result, [
    { index: 0, x: 347, y: 8, width: 64, height: 312, fill: '#051C2C' },
    { index: 1, x: 411, y: 320, width: 64, height: 156, fill: '#00A9F0' },
  ]);
});
