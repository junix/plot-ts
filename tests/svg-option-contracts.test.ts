import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type GaugeChart, type RadarChart } from '../src/svg/index.js';

const axes = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
const errors = {
  donut: 'Donut values must be non-negative',
  radar: 'Radar values must be non-negative',
  max: 'Radar maximum must be finite and positive',
  bands: 'Gauge bands must be an array',
  endpoints: 'Gauge band endpoints must be finite',
  bounds: 'Gauge band endpoints must satisfy 0 <= from <= to <= maximum',
};
const donut = (values: number[]) => figure().donut({ items: values.map((value, i) => ({ name: String(i), value })) }).render();
const radar = (values: number[]) => figure().radar({ axes, series: [{ values }] }).render();
const gauge = (bands: unknown, value = 5, max = 10) => figure().gauge({ value, max, bands } as Omit<GaugeChart, 'type'>).render();
function rejects(render: () => string, message: string): void {
  assert.throws(render, { name: 'RangeError', message });
}

// Before these contracts, negative shares/radii returned SVG rather than errors.
// In particular, cancelling donut parts returned an empty chart. None of those
// outputs defined signed-share or signed-axis semantics; they now fail explicitly.
for (const values of [[-1], [-1, -2, -3], [-1, 2, -3], [-1, 1], [-Number.MIN_VALUE, 1]]) {
  test(`negative shares and radii reject for ${values.join(',')}`, () => {
    rejects(() => donut(values), errors.donut);
    rejects(() => radar(values), errors.radar);
  });
}

test('radar validates negative extras, later series, sparse supplied values and empty-axis data', () => {
  for (const chartAxes of [axes, []]) {
    rejects(() => figure().radar({ axes: chartAxes, series: [{ values: [1, 2, 3, -1] }] }).render(), errors.radar);
  }
  rejects(() => figure().radar({ axes, series: [{ values: [1] }, { values: [-1] }] }).render(), errors.radar);
  const sparse = new Array<number>(3);
  sparse[2] = -1;
  rejects(() => radar(sparse), errors.radar);
});

test('zero and negative-zero retain identical non-negative chart output', () => {
  for (const render of [donut, radar]) {
    assert.equal(render([-0, 1, -0]), render([0, 1, 0]));
    assert.equal(render([-0, -0, -0]), render([0, 0, 0]));
  }
});

for (const value of [NaN, Infinity, -Infinity]) {
  test(`existing nonfinite value errors are retained for ${value}`, () => {
    rejects(() => donut([value]), 'Donut values must be finite');
    rejects(() => radar([value]), 'Radar values must be finite');
  });
}

for (const max of [0, -0, -1, NaN, Infinity, -Infinity, null, '10', true, {}]) {
  test(`explicit radar max ${String(max)} (${typeof max}) rejects even without observations`, () => {
    const chartAxes = [{ name: 'A', max }] as RadarChart['axes'];
    for (const series of [[], [{ values: [] }], [{ values: [1] }]]) {
      rejects(() => figure().radar({ axes: chartAxes, series }).render(), errors.max);
    }
  });
}

test('omitted or undefined radar maxima infer while positive explicit maxima retain clipping', () => {
  const config = { axes, series: [{ values: [1, 2, 3] }] };
  const explicitUndefined = axes.map(axis => ({ ...axis, max: undefined })) as unknown as RadarChart['axes'];
  assert.equal(figure().radar({ ...config, axes: explicitUndefined }).render(), figure().radar(config).render());
  for (const max of [Number.MIN_VALUE, 1, 10, Number.MAX_VALUE]) {
    const output = figure().radar({ axes: axes.map(axis => ({ ...axis, max })), series: [{ values: [1, 2, 3] }] }).render();
    assert.doesNotMatch(output, /NaN|Infinity/);
  }
  const render = (values: number[]) => figure().radar({ axes: axes.map(axis => ({ ...axis, max: 1 })), series: [{ values }] }).render();
  assert.equal(render([1, 1, 1]), render([2, 3, 4]));
});

for (const bands of [null, {}, 'bands', 0, false]) {
  test(`gauge rejects a non-array bands option (${String(bands)})`, () => rejects(() => gauge(bands), errors.bands));
}

for (const [name, band] of [
  ['undefined', undefined], ['null', null], ['boolean', false], ['number', 1], ['string', 'band'],
  ['empty object', {}], ['missing from', { to: 1 }], ['missing to', { from: 0 }],
  ['string from', { from: '0', to: 1 }], ['string to', { from: 0, to: '1' }],
  ['null from', { from: null, to: 1 }], ['null to', { from: 0, to: null }],
] as const) {
  test(`gauge rejects malformed band endpoints: ${name}`, () => rejects(() => gauge([band]), errors.endpoints));
}

test('gauge rejects sparse bands and validates every supplied entry', () => {
  rejects(() => gauge(new Array(1)), errors.endpoints);
  rejects(() => gauge([{ from: 0, to: 1, color: 'red' }, { from: 1 }]), errors.endpoints);
});

for (const endpoint of [NaN, Infinity, -Infinity]) {
  test(`gauge rejects nonfinite ${endpoint} at either band endpoint`, () => {
    rejects(() => gauge([{ from: endpoint, to: 1, color: 'red' }]), errors.endpoints);
    rejects(() => gauge([{ from: 0, to: endpoint, color: 'red' }]), errors.endpoints);
  });
}

for (const [from, to] of [[-Number.MIN_VALUE, 0], [-1, 1], [-2, -1], [0, 10 + 1e-12], [11, 11], [2, 1], [10, 0]]) {
  test(`gauge rejects out-of-range or reversed band ${from}..${to}`, () => {
    rejects(() => gauge([{ from, to, color: 'red' }]), errors.bounds);
  });
}

test('gauge bounds use the resolved scale, including the zero-value fallback', () => {
  const render = (to: number) => figure().gauge({ value: 0, bands: [{ from: 0, to, color: 'red' }] }).render();
  assert.equal(render(1), gauge([{ from: 0, to: 1, color: 'red' }], 0, 1));
  rejects(() => render(2), errors.bounds);
  rejects(() => figure().gauge({ value: 5, bands: [{ from: 0, to: 6, color: 'red' }] }).render(), errors.bounds);
});

test('gauge gaps, overlaps, out-of-order bands and zero-length endpoints retain input order', () => {
  const bands = [
    { from: 8, to: 10, color: '#123456' },
    { from: 1, to: 4, color: '#234567' },
    { from: 3, to: 5, color: '#345678' },
    { from: 0, to: 0, color: '#456789' },
    { from: 10, to: 10, color: '#56789a' },
  ];
  const output = gauge(bands);
  assert.doesNotMatch(output, /NaN|Infinity/);
  assert.deepEqual([...output.matchAll(/<path\b[^>]*fill="([^"]+)"/g)].map(match => match[1]), bands.map(band => band.color));
  assert.equal(gauge([{ from: -0, to: 10, color: 'red' }]), gauge([{ from: 0, to: 10, color: 'red' }]));
});

test('empty gauge bands stay empty and omitted bands keep default arcs and clamped pointer', () => {
  assert.doesNotMatch(gauge([]), /<path\b/);
  const options = { value: 5, max: 10 };
  const omitted = figure().gauge(options).render();
  assert.equal((omitted.match(/<path\b/g) ?? []).length, 3);
  assert.equal(gauge(undefined), omitted);
  for (const value of [-5, 20]) {
    const full = gauge([{ from: 0, to: 10, color: 'red' }], value);
    assert.equal(full.replace(/<path\b[^>]*\/>/g, ''), gauge([], value));
  }
});

test('contracts run during render, fail composed figures, and preserve invalid caller data', () => {
  const donutItems = [{ name: 'A', value: 1 }];
  const donutFigure = figure().donut({ items: donutItems });
  donutItems[0]!.value = -1;
  rejects(() => donutFigure.render(), errors.donut);
  assert.deepEqual(donutItems, [{ name: 'A', value: -1 }]);

  const chartAxes = [{ name: 'A', max: 10 }];
  const values = [1];
  const radarFigure = figure().radar({ axes: chartAxes, series: [{ values }] });
  chartAxes[0]!.max = 0;
  rejects(() => radarFigure.render(), errors.max);
  chartAxes[0]!.max = 10;
  values[0] = -1;
  rejects(() => radarFigure.render(), errors.radar);

  const bands = [{ from: 0, to: 10, color: 'red' }];
  const gaugeFigure = figure().gauge({ value: 5, max: 10, bands });
  bands[0]!.from = 11;
  rejects(() => gaugeFigure.render(), errors.bounds);
  assert.deepEqual(bands, [{ from: 11, to: 10, color: 'red' }]);

  rejects(() => figure().donut({ items: [{ name: 'A', value: 1 }] })
    .radar({ axes, series: [{ values: [-1] }] }).render(), errors.radar);
  rejects(() => figure().radar({ axes, series: [{ values: [1] }] })
    .gauge({ value: 5, max: 10, bands }).render(), errors.bounds);
});

test('valid frozen configuration renders deterministically without normalization or mutation', () => {
  const items = [{ name: 'A', value: 0 }, { name: 'B', value: 2 }];
  const chartAxes = [{ name: 'A', max: 10 }, { name: 'B' }];
  const values = [1, 2];
  const bands = [{ from: 6, to: 8, color: 'red' }, { from: 2, to: 7, color: 'blue' }];
  const before = structuredClone({ items, chartAxes, values, bands });
  for (const array of [items, chartAxes, values, bands]) {
    array.forEach(item => { if (typeof item === 'object') Object.freeze(item); });
    Object.freeze(array);
  }
  const composed = figure().donut({ items }).radar({ axes: chartAxes, series: [{ values }] })
    .gauge({ value: 5, max: 10, bands });
  assert.equal(composed.render(), composed.render());
  assert.deepEqual({ items, chartAxes, values, bands }, before);
});
