import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type ColumnChart } from '../src/svg/index.js';

type Config = Omit<ColumnChart, 'type'>;
type Mark = { index: number; x: number; y: number; width: number; height: number };

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
      width: Number(attr('width')), height: Number(attr('height')),
    };
  });
}

test('audit regression: off-category negative value cannot shrink the visible bar', () => {
  const config: Config = { categories: ['A'], series: [{ values: [1, -100] }], yAxis: true };
  const output = render(config);
  assert.deepEqual(marks(output), [{ index: 0, x: 379, y: 22, width: 64, height: 454 }]);
  assert.equal(output, render({ ...config, series: [{ values: [1] }] }));
  assert.match(output, /<line\b[^>]*y1="476"[^>]*stroke-opacity="0.16"/);
});

for (const yAxis of [false, true]) {
  for (const values of [[1, -100], [-1, 100], [-1, -100], [0, -100], [1, 100]]) {
    test(`grouped domain ignores off-category extras: ${values} (axis=${yAxis})`, () => {
      const config: Config = { categories: ['A'], series: [{ values }], yAxis };
      assert.equal(render(config), render({ ...config, series: [{ values: values.slice(0, 1) }] }));
    });
  }

  test(`zero categories ignore every supplied value (axis=${yAxis})`, () => {
    const config: Config = {
      categories: [], series: [{ values: [1, -100, null, NaN] }, { values: [-200, Infinity] }], yAxis,
    };
    const output = render(config);
    assert.equal(output, render({ ...config, series: [{ values: [] }, { values: [] }] }));
    assert.deepEqual(marks(output), []);
  });
}

test('each grouped series contributes only its rendered pairs to the shared domain', () => {
  const config: Config = {
    categories: ['A', 'B'], yAxis: true, labels: false,
    series: [{ values: [10, -5, -100] }, { values: [-2, 20, 100] }, { values: [null, -10, -1000] }],
  };
  const output = render(config);
  assert.equal(output, render({ ...config, series: config.series.map(s => ({ values: s.values.slice(0, 2) })) }));
  assert.deepEqual(marks(output).map(({ index, y, height }) => ({ index, y, height })), [
    { index: 0, y: 164, height: 156 }, { index: 1, y: 320, height: 31.2 },
    { index: 3, y: 320, height: 78 }, { index: 4, y: 8, height: 312 },
    { index: 5, y: 320, height: 156 },
  ]);
});

test('short series still omit missing pairs without changing slots or animation indices', () => {
  const config: Config = {
    categories: ['A', 'B', 'C'], yAxis: true, labels: false,
    series: [{ values: [10] }, { values: [-5, 20] }, { values: [] }],
  };
  const output = render(config);
  assert.equal(output, render({ ...config, series: [
    { values: [10, null, null] }, { values: [-5, 20, null] }, { values: [null, null, null] },
  ] }));
  assert.deepEqual(marks(output).map(m => m.index), [0, 1, 4]);
});

test('null, sparse and nonfinite paired values retain omission and original indices', () => {
  const sparse: (number | null)[] = [1, null, NaN, Infinity, -Infinity];
  sparse.length = 6;
  sparse.push(-2, -100);
  const config: Config = { categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], yAxis: true, series: [{ values: sparse }] };
  const output = render(config);
  assert.equal(output, render({ ...config, series: [{ values: [1, null, null, null, null, null, -2] }] }));
  assert.deepEqual(marks(output).map(m => m.index), [0, 6]);
});

test('nonfinite off-category extras are ignored rather than rejected', () => {
  const config: Config = { categories: ['A'], yAxis: true, series: [{ values: [1, NaN, Infinity, -Infinity] }] };
  assert.equal(render(config), render({ ...config, series: [{ values: [1] }] }));
});

test('all omitted paired values retain the empty fallback domain despite extras', () => {
  const config: Config = {
    categories: ['A', 'B'], yAxis: true, series: [{ values: [null, NaN, -100] }, { values: [Infinity, null, 100] }],
  };
  const output = render(config);
  assert.equal(output, render({ ...config, series: [{ values: [null, null] }, { values: [null, null] }] }));
  assert.deepEqual(marks(output), []);
});

for (const max of [20, 5, 0, -10]) {
  test(`explicit max=${max} stays authoritative while the inferred minimum ignores extras`, () => {
    const config: Config = {
      categories: ['A'], series: [{ values: [10, -100] }, { values: [-5, 100] }], yAxis: true, labels: false, max,
    };
    const output = render(config);
    assert.equal(output, render({ ...config, series: [{ values: [10] }, { values: [-5] }] }));
    if (max === 20) {
      assert.deepEqual(marks(output).map(({ y, height }) => ({ y, height })), [
        { y: 195.2, height: 187.2 }, { y: 382.4, height: 93.6 },
      ]);
    } else if (max === 5) {
      assert.deepEqual(marks(output).map(({ y, height }) => ({ y, height })), [
        { y: -226, height: 468 }, { y: 242, height: 234 },
      ]);
    }
  });
}

test('signed stacks retain separate totals, omission and explicit max with extra values', () => {
  for (const max of [undefined, 20, 5]) {
    const config: Config = {
      categories: ['A', 'B'], stacked: true, yAxis: true,
      ...(max === undefined ? {} : { max }),
      series: [{ values: [10, -5, -100] }, { values: [-5, 20, 100] }, { values: [null] }, { values: [3, -2, -1000] }],
    };
    assert.equal(render(config), render({ ...config, series: config.series.map(s => ({ values: s.values.slice(0, 2) })) }));
  }
});

test('paired-domain inference is deterministic and does not mutate frozen inputs', () => {
  const config: Config = { categories: ['A'], series: [{ values: [1, -100] }], yAxis: true };
  Object.freeze(config.categories);
  Object.freeze(config.series[0]!.values);
  Object.freeze(config.series[0]);
  Object.freeze(config.series);
  Object.freeze(config);
  const before = structuredClone(config);
  const first = render(config);
  assert.equal(render(config), first);
  assert.deepEqual(config, before);
});
