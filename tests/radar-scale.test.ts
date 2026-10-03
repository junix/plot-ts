import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type RadarChart } from '../src/svg/index.js';

type Config = Omit<RadarChart, 'type'>;
const axes = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

function polygons(config: Config): Array<Array<[number, number]>> {
  const output = figure({ width: 800, height: 500 }).radar(config).render();
  assert.doesNotMatch(output, /NaN|Infinity/, 'all geometry must be finite');
  return [...output.matchAll(/<polygon points="([^"]*)"/g)].map(match =>
    match[1]!.split(' ').filter(Boolean).map(point => {
      const [x, y] = point.split(',').map(Number);
      return [x!, y!] as [number, number];
    }),
  );
}

function radius(point: [number, number]): number {
  return Math.hypot(point[0] - 400, point[1] - 250);
}

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 0.02, `expected ${expected}, received ${actual}`);
}

test('radar series use one shared scale on every axis', () => {
  const [small, large] = polygons({ axes, series: [{ values: [1, 1, 1] }, { values: [100, 100, 100] }] });
  for (let ai = 0; ai < axes.length; ai++) {
    near(radius(small![ai]!), 2.1);
    near(radius(large![ai]!), 210);
  }
});

test('one default maximum covers every series and declared axis', () => {
  const [small, large] = polygons({ axes, series: [{ values: [10, 100, 5] }, { values: [20, 200, 25] }] });
  [10.5, 105, 5.25].forEach((expected, ai) => near(radius(small![ai]!), expected));
  [21, 210, 26.25].forEach((expected, ai) => near(radius(large![ai]!), expected));
});

test('shared radar scales do not depend on series order', () => {
  const first = { values: [10, 100, 5] }, second = { values: [20, 200, 25] };
  assert.deepEqual(polygons({ axes, series: [first, second] }), polygons({ axes, series: [second, first] }).reverse());
});

test('all-zero radar axes resolve to finite center points', () => {
  assert.deepEqual(polygons({ axes, series: [{ values: [0, 0, 0] }, { values: [0, 0, 0] }] }), [
    [[400, 250], [400, 250], [400, 250]], [[400, 250], [400, 250], [400, 250]],
  ]);
});

test('an all-zero axis stays centered beside positive axes', () => {
  const points = polygons({ axes, series: [{ values: [0, 10, 5] }, { values: [0, 20, 25] }] });
  assert.deepEqual(points.map(p => p[0]), [[400, 250], [400, 250]]);
  near(radius(points[0]![1]!), 84);
  near(radius(points[1]![1]!), 168);
});

test('missing values remain centered without widening other axes', () => {
  const [first, second] = polygons({ axes, series: [{ values: [10] }, { values: [20, 100, 25] }] });
  near(radius(first![0]!), 21);
  assert.deepEqual(first!.slice(1), [[400, 250], [400, 250]]);
  [42, 210, 52.5].forEach((expected, ai) => near(radius(second![ai]!), expected));
});

test('values beyond declared radar axes do not change the inferred scales', () => {
  assert.deepEqual(
    polygons({ axes, series: [{ values: [10, 20, 30, 10000] }] }),
    polygons({ axes, series: [{ values: [10, 20, 30] }] }),
  );
});

test('positive explicit per-axis maxima retain existing geometry', () => {
  assert.deepEqual(polygons({
    axes: [{ name: 'A', max: 20 }, { name: 'B', max: 200 }, { name: 'C', max: 25 }],
    series: [{ values: [10, 100, 5] }],
  }), [[[400, 145], [490.93, 302.5], [363.63, 271]]]);
});

test('explicit maxima retain the existing upper-radius cap', () => {
  const [points] = polygons({ axes: axes.map(axis => ({ ...axis, max: 10 })), series: [{ values: [20, 30, 40] }] });
  points!.forEach(point => near(radius(point), 210));
});

test('explicit maxima can be mixed with the shared inferred maximum', () => {
  const [points] = polygons({
    axes: [{ name: 'A', max: 200 }, { name: 'B' }, { name: 'C', max: 50 }],
    series: [{ values: [100, 100, 25] }],
  });
  [105, 210, 105].forEach((expected, ai) => near(radius(points![ai]!), expected));
});

for (const max of [0, -1, NaN, Infinity, -Infinity]) {
  test(`invalid explicit maximum ${max} falls back to inferred scales`, () => {
    assert.deepEqual(
      polygons({ axes: axes.map(axis => ({ ...axis, max })), series: [{ values: [10, 20, 30] }] }),
      polygons({ axes, series: [{ values: [10, 20, 30] }] }),
    );
  });
}

test('ordinary unequal single-series radar data preserves its shape', () => {
  assert.deepEqual(polygons({ axes, series: [{ values: [10, 100, 5] }] }), [
    [[400, 229], [581.87, 355], [390.91, 255.25]],
  ]);
});

test('ordinary uniform radar data preserves its geometry', () => {
  assert.deepEqual(polygons({ axes, series: [{ values: [100, 100, 100] }] }), [
    [[400, 40], [581.87, 355], [218.13, 355]],
  ]);
});

test('empty radar data remains finite', () => {
  assert.deepEqual(polygons({ axes, series: [] }), []);
  assert.deepEqual(polygons({ axes, series: [{ values: [] }] }), [[[400, 250], [400, 250], [400, 250]]]);
  assert.deepEqual(polygons({ axes: [], series: [{ values: [] }] }), [[]]);
});
