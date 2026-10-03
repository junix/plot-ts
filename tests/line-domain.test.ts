import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type LineChart } from '../src/svg/index.js';

function render(config: Omit<LineChart, 'type'>): string {
  return figure({ width: 300, height: 200 }).line(config).render();
}

function linePaths(output: string): string[] {
  return [...output.matchAll(/<path d="([^"]+)" fill="none"/g)].map(match => match[1]!);
}

function areaPaths(output: string): string[] {
  return [...output.matchAll(/<path d="([^"]+)" fill="[^"]+" opacity="0.15"/g)].map(match => match[1]!);
}

function coordinates(path: string): Array<[number, number]> {
  return [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
}

function finiteOutput(output: string): void {
  assert.ok(!/NaN|Infinity/.test(output), 'all SVG coordinates must be finite');
}

for (const values of [[-20, -10], [-20, 10, 30], [-10, -10], [0, 0]]) {
  test(`line domain contains values ${values.join(', ')}`, () => {
    const output = render({ x: values.map((_, index) => index), series: [{ y: values }], yAxis: true });
    finiteOutput(output);
    const paths = linePaths(output);
    assert.equal(paths.length, 1);
    const points = coordinates(paths[0]!);
    assert.equal(points.length, values.length);
    for (const [x, y] of points) {
      assert.ok(x >= 30 && x <= 292, `x=${x} must stay inside the plot`);
      assert.ok(y >= 22 && y <= 176, `y=${y} must stay inside the plot`);
    }
  });
}

for (const x of [[7], [7, 7, 7]]) {
  test(`constant x domain with ${x.length} samples is centered`, () => {
    const output = render({ x, series: [{ y: x.map((_, i) => i + 1), area: true }] });
    finiteOutput(output);
    const paths = linePaths(output);
    assert.equal(paths.length, 1);
    const points = coordinates(paths[0]!);
    assert.equal(points.length, Math.max(2, x.length));
    assert.ok(points.every(([px]) => px === 147));
    assert.ok(coordinates(areaPaths(output)[0]!).every(([px]) => px === 147));
  });
}

test('ordinary positive data keeps the existing geometry', () => {
  const output = render({ x: [0, 1, 2], series: [{ y: [10, 20, 30], area: true }] });
  assert.deepEqual(linePaths(output), ['M2,124.67 L147,73.33 L292,22']);
  assert.deepEqual(areaPaths(output), ['M2,176 L2,124.67 L147,73.33 L292,22 L292,176 Z']);
});

test('null samples split both the line and area into separate segments', () => {
  const output = render({ x: [0, 1, 2, 3, 4], series: [{ y: [10, 20, null, 30, 40], area: true }] });
  finiteOutput(output);
  assert.deepEqual(linePaths(output), ['M2,137.5 L74.5,99', 'M219.5,60.5 L292,22']);
  assert.deepEqual(areaPaths(output), [
    'M2,176 L2,137.5 L74.5,99 L74.5,176 Z',
    'M219.5,176 L219.5,60.5 L292,22 L292,176 Z',
  ]);
});

test('area fill closes at the actual endpoints when leading and trailing data are absent', () => {
  const output = render({ x: [0, 1, 2, 3, 4], series: [{ y: [null, 10, 20, null], area: true }] });
  finiteOutput(output);
  assert.deepEqual(linePaths(output), ['M74.5,99 L147,22']);
  assert.deepEqual(areaPaths(output), ['M74.5,176 L74.5,99 L147,22 L147,176 Z']);
});

test('non-finite coordinates are missing samples, not SVG coordinates', () => {
  const output = render({
    x: [0, 1, 2, NaN, 4, 5, Infinity, 7],
    series: [{ y: [10, 20, NaN, 1e9, 30, 40, -1e9, Infinity], area: true }],
    yAxis: true,
  });
  finiteOutput(output);
  const paths = linePaths(output);
  assert.equal(paths.length, 2);
  assert.equal(areaPaths(output).length, 2);
  assert.equal(coordinates(paths[0]!).length, 2);
  assert.equal(coordinates(paths[1]!).length, 2);
  assert.equal(coordinates(paths[1]!)[1]![1], 22, 'an unpaired y value must not widen the domain');
});

test('y values beyond the x array do not affect the paired data domain', () => {
  const output = render({ x: [0, 1], series: [{ y: [10, 20, 1e9] }] });
  assert.deepEqual(linePaths(output), ['M2,99 L292,22']);
});

for (const config of [
  { x: [], series: [] },
  { x: [], series: [{ y: [10] }] },
  { x: [0, 1], series: [{ y: [null, null] }] },
  { x: [NaN, Infinity], series: [{ y: [10, 20] }] },
] satisfies Array<Omit<LineChart, 'type'>>) {
  test(`empty or missing data renders finite axes: ${JSON.stringify(config)}`, () => {
    const output = render({ ...config, yAxis: true });
    finiteOutput(output);
    assert.deepEqual(linePaths(output), []);
    assert.deepEqual(areaPaths(output), []);
  });
}

for (const max of [NaN, Infinity, -Infinity]) {
  test(`non-finite explicit max ${max} falls back to the data domain`, () => {
    const output = render({ x: [0, 1], series: [{ y: [10, 20] }], max });
    finiteOutput(output);
    assert.deepEqual(linePaths(output), ['M2,99 L292,22']);
  });
}

test('isolated valid samples around a gap remain visible with round-capped line segments', () => {
  const output = render({ x: [0, 1, 2], series: [{ y: [10, null, 20] }] });
  finiteOutput(output);
  assert.deepEqual(linePaths(output), ['M2,99 L2,99', 'M292,22 L292,22']);
  assert.equal(output.match(/stroke-linecap="round"/g)?.length, 2);
});

test('more than 200,000 samples do not overflow the argument stack during domain calculation', () => {
  const count = 200_001;
  const output = render({
    x: Array.from({ length: count }, (_, i) => i),
    series: [{ y: Array.from({ length: count }, () => 10) }],
  });
  finiteOutput(output);
  const paths = linePaths(output);
  assert.equal(paths.length, 1);
  assert.ok(paths[0]!.startsWith('M2,22 L'));
  assert.ok(paths[0]!.endsWith('L292,22'));
});

test('many isolated samples do not overflow the argument stack while joining paths', () => {
  const count = 300_001;
  const output = render({
    x: Array.from({ length: count }, (_, i) => i),
    series: [{ y: Array.from({ length: count }, (_, i) => i % 2 === 0 ? 10 : null), area: true }],
  });
  finiteOutput(output);
  let pathCount = 0;
  for (const _ of output.matchAll(/<path /g)) pathCount++;
  assert.equal(pathCount, Math.ceil(count / 2) * 2, 'one line and one area per isolated sample');
  assert.ok(output.includes('d="M2,22 L2,22"'));
  assert.ok(output.includes('d="M292,22 L292,22"'));
});
