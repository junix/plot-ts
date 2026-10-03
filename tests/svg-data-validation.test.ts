import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type RadarChart, type ScatterChart } from '../src/svg/index.js';

const names = ['A', 'B', 'C'];
const axes = names.map(name => ({ name }));
const invalid = [NaN, Infinity, -Infinity];
const errors = {
  heatmap: 'Heatmap values must be finite',
  rectangular: 'Heatmap data must be rectangular',
  waterfall: 'Waterfall values must be finite',
  paired: 'Waterfall categories and values must have equal lengths',
  donut: 'Donut values must be finite',
  radar: 'Radar values must be finite',
  slope: 'Slope endpoints must be finite',
  size: 'Scatter size must be finite and non-negative for finite coordinate pairs',
};
function rejects(render: () => string, message: string): void {
  assert.throws(render, { name: 'RangeError', message });
}
function finite(output: string): void {
  assert.doesNotMatch(output, /NaN|Infinity/);
}

// These are the twelve malformed-SVG inputs recorded in the bounded 118-case audit,
// excluding empty heatmap yLabels, which has a separate option regression test.
const auditCases: Array<[string, () => string, string]> = [
  ['heatmap-nonfinite', () => figure().heatmap({ data: [invalid] }).render(), errors.heatmap],
  ['heatmap-ragged-short', () => figure().heatmap({ data: [[1, 2], [3]] }).render(), errors.rectangular],
  ['heatmap-mixed-nonfinite', () => figure().heatmap({ data: [[1, NaN], [2, 3]] }).render(), errors.heatmap],
  ['waterfall-nonfinite', () => figure().waterfall({ categories: names, values: invalid }).render(), errors.waterfall],
  ['waterfall-short-values', () => figure().waterfall({ categories: names, values: [1] }).render(), errors.paired],
  ['waterfall-mixed-nonfinite', () => figure().waterfall({ categories: names, values: [1, NaN, 3] }).render(), errors.waterfall],
  ['donut-nonfinite', () => figure().donut({ items: invalid.map((value, i) => ({ name: names[i]!, value })), labels: false }).render(), errors.donut],
  ['radar-nonfinite', () => figure().radar({ axes, series: [{ values: invalid }] }).render(), errors.radar],
  ['slope-nonfinite', () => figure().slope({ items: invalid.map((left, i) => ({ name: names[i]!, left, right: invalid[(i + 1) % 3]! })) }).render(), errors.slope],
  ['slope-mixed-nonfinite', () => figure().slope({ items: [{ name: 'A', left: 1, right: NaN }, { name: 'B', left: 2, right: 3 }] }).render(), errors.slope],
  ['scatter-negative-size', () => figure().scatter({ points: [{ x: 0, y: 1, size: -1 }, { x: 1, y: 2 }] }).render(), errors.size],
  ['scatter-nonfinite-size', () => figure().scatter({ points: [{ x: 0, y: 1, size: Infinity }, { x: 1, y: 2 }] }).render(), errors.size],
];
for (const [name, render, message] of auditCases) {
  test(`audit regression: ${name} fails before returning malformed SVG`, () => rejects(render, message));
}

test('heatmap rejects both ragged directions, including a later nonempty row after an empty first row', () => {
  for (const data of [[[1], [2, 100]], [[], [1]], [[1], []]]) {
    rejects(() => figure().heatmap({ data }).render(), errors.rectangular);
  }
});

test('waterfall rejects extra values and either one-sided empty list', () => {
  for (const [categories, values] of [[['A'], [1, 2, 3]], [[], [1]], [['A'], []]] as Array<[string[], number[]]>) {
    rejects(() => figure().waterfall({ categories, values }).render(), errors.paired);
  }
});

for (const value of invalid) {
  test(`each numeric boundary rejects an isolated or mixed ${String(value)}`, () => {
    for (const data of [[[value]], [[1, value]]]) {
      rejects(() => figure().heatmap({ data }).render(), errors.heatmap);
    }
    for (const values of [[value], [1, value]]) {
      rejects(() => figure().waterfall({ categories: names.slice(0, values.length), values }).render(), errors.waterfall);
      rejects(() => figure().donut({ items: values.map(value => ({ name: 'part', value })) }).render(), errors.donut);
      rejects(() => figure().radar({ axes, series: [{ values }] }).render(), errors.radar);
    }
    // Invalid endpoints are rejected on either side and with an explicit scale.
    for (const [left, right] of [[value, 1], [1, value]] as const) {
      rejects(() => figure().slope({ items: [{ name: 'A', left, right }], max: 10 }).render(), errors.slope);
    }
    rejects(() => figure().radar({ axes, series: [{ values: [1, 2, 3] }, { values: [1, value] }] }).render(), errors.radar);
    rejects(() => figure().scatter({ points: [{ x: 1, y: 1, size: value }] }).render(), errors.size);
  });
}

test('radar validates supplied extra values but continues ignoring finite extras for visible axes', () => {
  for (const value of invalid) {
    rejects(() => figure().radar({ axes, series: [{ values: [1, 2, 3, value] }] }).render(), errors.radar);
    rejects(() => figure().radar({ axes: [], series: [{ values: [value] }] }).render(), errors.radar);
  }
  const render = (values: number[]) => figure().radar({ axes, series: [{ values }] }).render();
  assert.equal(render([1, 2, 3, 100]), render([1, 2, 3]));
});

test('scatter preserves coordinate omission, even when omitted pairs have invalid sizes', () => {
  for (const size of [-1, ...invalid]) {
    for (const coordinate of invalid) {
      for (const points of [
        [{ x: coordinate, y: 1, size }],
        [{ x: 1, y: coordinate, size }],
        [{ x: coordinate, y: coordinate, size }],
      ]) {
        assert.equal(figure().scatter({ points, yAxis: true }).render(), figure().scatter({ points: [], yAxis: true }).render());
        const withValid = figure().scatter({ points: [...points, { x: 2, y: 3 }], yAxis: true }).render();
        const onlyValid = figure().scatter({ points: [{ x: 2, y: 3 }], yAxis: true }).render();
        // Omission intentionally retains the valid point's original animation index.
        assert.equal(withValid.replace('style="--i:1"', 'style="--i:0"'), onlyValid);
        finite(withValid);
      }
    }
  }
});

test('scatter keeps default, positive, zero and negative-zero sizes with signed coordinates', () => {
  const points: ScatterChart['points'] = [
    { x: -2, y: -3 }, { x: -1, y: 2, size: 2.5 }, { x: 0, y: 0, size: 0 }, { x: 1, y: -1, size: -0 },
  ];
  const output = figure().scatter({ points }).render();
  finite(output);
  assert.deepEqual([...output.matchAll(/<circle\b[^>]*\br="([^"]+)"/g)].map(match => match[1]), ['4', '2.5', '0', '0']);
});

test('line retains finite-pair omission and gaps for nonfinite coordinates or values', () => {
  const output = figure().line({
    x: [0, NaN, 2, 3, Infinity, 5],
    series: [{ y: [1, 2, 3, NaN, 4, -2], area: true }], yAxis: true,
  }).render();
  finite(output);
  const paths = [...output.matchAll(/<path\b[^>]*fill="none"[^>]*>/g)];
  assert.equal(paths.length, 3, 'three separate finite segments retain the original gaps');
});

test('radar partial and empty values retain zero fallback, signed values and explicit scales', () => {
  const render = (values: number[], chartAxes: RadarChart['axes'] = axes) => figure().radar({ axes: chartAxes, series: [{ values }] }).render();
  assert.equal(render([1]), render([1, 0, 0]));
  assert.equal(render([]), render([0, 0, 0]));
  const sparse = new Array<number>(3);
  sparse[1] = 2;
  assert.equal(render(sparse), render([0, 2, 0]));
  sparse[1] = NaN;
  rejects(() => render(sparse), errors.radar);
  finite(render([-1, 2, -3]));
  finite(render([-1, 2, -3], axes.map(axis => ({ ...axis, max: 10 }))));
  assert.match(render([0, 0, 0]), /points="400,250 400,250 400,250"/);
});

test('ordinary finite, constant, zero and signed data remain accepted in every affected family', () => {
  for (const values of [[1, 2, 3], [2, 2, 2], [0, 0, 0], [-1, -2, -3], [-1, 2, -3]]) {
    const outputs = [
      figure().heatmap({ data: [values] }).render(),
      figure().waterfall({ categories: names, values }).render(),
      figure().donut({ items: values.map((value, i) => ({ name: names[i]!, value })) }).render(),
      figure().radar({ axes, series: [{ values }] }).render(),
      figure().slope({ items: values.map((left, i) => ({ name: names[i]!, left, right: values[(i + 1) % 3]! })) }).render(),
      figure().scatter({ points: values.map((y, x) => ({ x, y })) }).render(),
    ];
    outputs.forEach(finite);
  }
});

test('empty valid data preserves existing empty representations', () => {
  for (const data of [[], [[]], [[], []]]) {
    assert.equal(figure().heatmap({ data }).render(), figure().heatmap({ data: [] }).render());
  }
  const outputs = [
    figure().waterfall({ categories: [], values: [] }).render(),
    figure().donut({ items: [] }).render(),
    figure().radar({ axes: [], series: [] }).render(),
    figure().slope({ items: [] }).render(),
    figure().scatter({ points: [], yAxis: true }).render(),
  ];
  outputs.forEach(finite);
  assert.doesNotMatch(outputs[0]!, /<rect|<text/);
  assert.doesNotMatch(outputs[1]!, /<path|<text/);
  assert.doesNotMatch(outputs[2]!, /<polygon|<text/);
  assert.doesNotMatch(outputs[3]!, /<line|<circle/);
  assert.doesNotMatch(outputs[4]!, /<circle/);
});

test('validation does not mutate inputs and errors occur at render time, including composed figures', () => {
  const data = [[1, 2], [3, 4]];
  const values = [2, -1, 3];
  const items = values.map((value, i) => ({ name: names[i]!, value }));
  const points = values.map((y, x) => ({ x, y, size: 0 }));
  const before = structuredClone({ data, values, items, points });
  const fig = figure().heatmap({ data }).waterfall({ categories: names, values }).donut({ items })
    .radar({ axes, series: [{ values }] }).scatter({ points });
  finite(fig.render());
  assert.equal(fig.render(), fig.render());
  assert.deepEqual({ data, values, items, points }, before);

  const invalidValues = [1, NaN];
  const invalidFigure = figure().scatter({ points }).waterfall({ categories: ['A', 'B'], values: invalidValues });
  rejects(() => invalidFigure.render(), errors.waterfall);
  assert.deepEqual(invalidValues, [1, NaN]);
  const mutable = [1];
  const deferred = figure().waterfall({ categories: ['A'], values: mutable });
  mutable[0] = Infinity;
  rejects(() => deferred.render(), errors.waterfall);
});
