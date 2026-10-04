import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type GaugeChart } from '../src/svg/index.js';

function render(config: Omit<GaugeChart, 'type'>, width = 800, height = 500): string {
  return figure({ width, height }).gauge(config).render();
}

function paths(output: string): string[] {
  return [...output.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]!);
}

function arcFlags(path: string): number[][] {
  return [...path.matchAll(/A[\d.,-]+ 0 ([01]),([01]) /g)].map(match => [Number(match[1]), Number(match[2])]);
}

const boundaries = [
  { name: 'just below 180 degrees', extent: 180 - 1e-6, large: 0 },
  { name: 'exactly 180 degrees', extent: 180, large: 0 },
  { name: 'just above 180 degrees', extent: 180 + 1e-6, large: 1 },
  { name: 'wide 200-degree band', extent: 200, large: 1 },
  { name: 'full 252-degree band', extent: 252, large: 1 },
];
for (const { name, extent, large } of boundaries) {
  test(`gauge ${name} uses matching outer/inner extent and opposite winding`, () => {
    const output = render({ value: 126, max: 252, bands: [{ from: 0, to: extent, color: '#f00' }] });
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.equal(paths(output).length, 1);
    assert.deepEqual(arcFlags(paths(output)[0]!), [[large, 1], [large, 0]]);
  });
}

test('normalized full-range gauge reproducer uses two large arcs', () => {
  const output = render({ value: 0.5, max: 1, bands: [{ from: 0, to: 1, color: '#f00' }] });
  assert.deepEqual(paths(output), ['M238.2,467.56 A200,200 0 1,1 561.8,467.56 L513.26,432.29 A140,140 0 1,0 286.74,432.29 Z']);
});

test('semicircle classification is stable across maxima and shifted band starts', () => {
  for (const max of [1, 7, 100, 252, 7000]) {
    for (const from of max % 7 === 0 ? [0, max / 7, max * 2 / 7] : [0]) {
      const to = from + max * 5 / 7;
      // Use a representable exact half-turn boundary in the original data domain.
      const boundary = render({ value: max / 2, max, bands: [{ from, to, color: '#f00' }] });
      assert.deepEqual(arcFlags(paths(boundary)[0]!), [[0, 1], [0, 0]], `max=${max}, from=${from}`);
      for (const [factor, flag] of [[1 - 1e-8, 0], [1 + 1e-8, 1]] as const) {
        const endpoint = from + (to - from) * factor;
        // The previous arc-only witness also accepted an endpoint just past max.
        // Keep that witness as an intentional rejection under the bounded-band contract.
        if (endpoint > max) {
          assert.throws(() => render({ value: max / 2, max, bands: [{ from, to: endpoint, color: '#f00' }] }),
            { name: 'RangeError', message: 'Gauge band endpoints must satisfy 0 <= from <= to <= maximum' });
        } else {
          const output = render({ value: max / 2, max, bands: [{ from, to: endpoint, color: '#f00' }] });
          assert.deepEqual(arcFlags(paths(output)[0]!), [[flag, 1], [flag, 0]]);
        }
      }
    }
  }
});

test('mixed custom bands choose their own large-arc flag and preserve colors/order', () => {
  const output = render({ value: 50, max: 100, bands: [
    { from: 0, to: 80, color: '#123456' },
    { from: 80, to: 100, color: '#abcdef' },
  ] });
  assert.deepEqual(paths(output).map(arcFlags), [[[1, 1], [1, 0]], [[0, 1], [0, 0]]]);
  assert.ok(output.indexOf('fill="#123456"') < output.indexOf('fill="#abcdef"'));
  assert.equal((output.match(/opacity="0.8"/g) ?? []).length, 2);
});

test('default and ordinary narrow bands retain small arcs', () => {
  const defaults = render({ value: 50, max: 100 });
  assert.deepEqual(paths(defaults).map(arcFlags), Array.from({ length: 3 }, () => [[0, 1], [0, 0]]));
  const custom = render({ value: 0, max: 1, bands: [
    { from: 0, to: 0.5, color: '#4CAF50' },
    { from: 0.5, to: 1, color: '#F44336' },
  ] });
  assert.deepEqual(paths(custom).map(arcFlags), [[[0, 1], [0, 0]], [[0, 1], [0, 0]]]);
});

test('wide band selection does not alter pointer, center, value label, or omitted-band behavior', () => {
  const config = { value: 0.5, max: 1, unit: '%', title: 'Gauge' };
  const wide = render({ ...config, bands: [{ from: 0, to: 1, color: '#f00' }] });
  const empty = render({ ...config, bands: [] });
  assert.equal(wide.replace(/<path\b[^>]*\/>/g, ''), empty);
  assert.equal(paths(empty).length, 0);
});

test('wide bands scale with panel size and support the inferred zero maximum', () => {
  for (const [width, height] of [[160, 120], [640, 360], [500, 800]] as const) {
    const config = { value: 0, bands: [{ from: 0, to: 1, color: '#f00' }] };
    const output = render(config, width, height);
    assert.equal(output, render({ ...config, max: 1 }, width, height));
    assert.deepEqual(arcFlags(paths(output)[0]!), [[1, 1], [1, 0]]);
    assert.doesNotMatch(output, /NaN|Infinity/);
  }
});

test('wide-band figures compose, render deterministically, and do not mutate band configuration', () => {
  const config = { value: 0.5, max: 1, bands: [{ from: 0, to: 1, color: '#f00' }] };
  const original = JSON.stringify(config);
  const fig = figure({ width: 640, height: 360 }).gauge(config).gauge({ value: 50, max: 100 });
  const output = fig.render();
  assert.equal(fig.render(), output);
  assert.equal(JSON.stringify(config), original);
  assert.deepEqual(paths(output).map(arcFlags), [
    [[1, 1], [1, 0]], [[0, 1], [0, 0]], [[0, 1], [0, 0]], [[0, 1], [0, 0]],
  ]);
});
