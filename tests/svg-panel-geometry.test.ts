import { semanticMarks } from './helpers/svg-motion.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { figure } from '../src/svg/index.js';
import { svg } from '../src/index.js';
import { renderColumn } from '../src/svg/charts.js';
import { panelCases } from './fixtures/svg-panel-fixtures.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/svg-panel-golden.json', import.meta.url), 'utf8')) as Record<string, string>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

for (const sample of panelCases) {
  test(`${sample.name}: direct and public renderers reject exact and smaller drawable bounds`, () => {
    for (const empty of [false, true]) {
      for (const [width, height] of [
        [sample.minWidth, 300], [sample.minWidth - 0.01, 300],
        [400, sample.minHeight], [400, sample.minHeight - 0.01],
      ] as const) {
        assert.throws(() => sample.render(width, height, empty), {
          name: 'RangeError', message: new RegExp(`SVG ${sample.type}.*(positive|exceed)`),
        });
        for (const entry of [figure, svg.figure]) {
          assert.throws(() => sample.add(entry({ width, height }), empty).render(), RangeError);
          if (width > 0 && height > 0) {
            assert.throws(() => sample.add(entry({ width, height }), empty).renderHtml(), RangeError);
          }
        }
      }
    }
  });

  test(`${sample.name}: positive near-boundary, default and grid SVG bytes are unchanged`, () => {
    for (const empty of [false, true]) {
      for (const [width, height] of [[sample.minWidth + 0.02, sample.minHeight + 0.02], [800, 500]]) {
        const key = `${sample.name}/${empty}/${width}/${height}`;
        assert.equal(sha(sample.render(width!, height!, empty)), golden[`${key}/direct`]);
        for (const entry of [figure, svg.figure]) {
          for (const title of ['', 'Panel title']) {
            const options = { width: width!, height: height! + (title ? 40 : 0), title };
            const chart = sample.add(entry(options), empty);
            const output = chart.render();
            assert.doesNotMatch(output, /NaN|Infinity/);
            assert.equal(sha(output), golden[`${key}/figure/${title}`]);
            assert.equal(chart.render(), output);
            assert.deepEqual(semanticMarks(chart.renderHtml()), semanticMarks(output));
          }
        }
      }
      const chart = sample.add(sample.add(figure({ width: 818, height: 380, gap: 16, title: 'Panel title' }), empty), empty);
      assert.equal(sha(chart.render()), golden[`${sample.name}/${empty}/grid`]);
    }
  });

  test(`${sample.name}: title reservation and direct invalid dimensions fail before SVG emission`, () => {
    for (const empty of [false, true]) {
      for (const value of [0, -1, NaN, Infinity, -Infinity]) {
        assert.throws(() => sample.render(value, 300, empty), RangeError);
        assert.throws(() => sample.render(400, value, empty), RangeError);
      }
      for (const title of ['Panel title', ' ']) {
        for (const height of [40, 39, 40 + sample.minHeight]) {
          assert.throws(() => sample.add(figure({ width: 400, height, title }), empty).render(), RangeError);
        }
      }
    }
  });

  test(`${sample.name}: 160×120 grid floor also respects this renderer's bounds`, () => {
    for (const empty of [false, true]) {
      for (const title of ['', 'Panel title']) {
        const chart = sample.add(sample.add(figure({ width: 320, height: 120 + (title ? 40 : 0), title, gap: 0 }), empty), empty);
        if (sample.minWidth >= 160) assert.throws(() => chart.render(), RangeError);
        else assert.doesNotThrow(() => chart.render());
      }
    }
  });
}

test('slope and pyramid grids accept only positive drawable widths above their exact bounds', () => {
  for (const sample of panelCases.filter(s => s.type === 'slope' || s.type === 'pyramid')) {
    for (const gap of [0, 16]) {
      for (const title of ['', 'Title']) {
        for (const columns of [1, 2]) {
          const rows = 2 / columns;
          const options = {
            width: sample.minWidth * columns + gap * (columns - 1),
            height: 120 * rows + gap * (rows - 1) + (title ? 40 : 0),
            columns, gap, title,
          };
          assert.throws(() => sample.add(sample.add(figure(options))).render(), RangeError);
          options.width += 0.02 * columns;
          const output = sample.add(sample.add(figure(options))).render();
          assert.doesNotMatch(output, /NaN|Infinity/);
          assert.equal((output.match(/data-panel-index=/g) ?? []).length, 2);
        }
      }
    }
  }
});

test('arithmetic-positive extents retain two-decimal serialization, and underflowed gauge radii fail', () => {
  for (const sample of panelCases.filter(s => s.type !== 'gauge')) {
    // The guard follows the existing arithmetic layout. It does not impose a
    // new minimum feature size on the serializer's two-decimal coordinates.
    assert.doesNotThrow(() => sample.render(sample.minWidth + 1e-10, sample.minHeight + 1e-10));
  }
  const gauge = panelCases.find(s => s.type === 'gauge')!;
  assert.throws(() => gauge.render(Number.MIN_VALUE, 100), /radius must be positive/);
  assert.throws(() => gauge.render(100, Number.MIN_VALUE), /radius must be positive/);
  assert.doesNotThrow(() => gauge.render(Number.MIN_VALUE * 2, 100));
});

test('figures without charts retain any finite positive size, even with an unrendered title', () => {
  for (const width of [Number.MIN_VALUE, 1, 20, 80]) {
    assert.doesNotThrow(() => figure({ width, height: 1, title: 'Title' }).render());
  }
});

test('finite but overflowing computed size geometry fails instead of emitting invalid SVG', () => {
  const radar = panelCases.find(s => s.type === 'radar')!;
  for (const empty of [false, true]) {
    assert.throws(() => radar.render(Number.MAX_VALUE, Number.MAX_VALUE, empty), /grid radii must be finite and positive/);
    assert.throws(() => radar.add(figure({ width: Number.MAX_VALUE, height: Number.MAX_VALUE }), empty).render(), RangeError);
  }
  assert.throws(() => figure({ width: 1e20, height: 100 })
    .bar({ categories: ['A'], series: [{ values: [1] }] }).render(), /recentered drawable width must be finite and positive/);
  assert.throws(() => renderColumn({ type: 'column', categories: ['A'], series: [{ values: [1] }] }, 1e20, 100), /recentered drawable width/);
  for (const columns of [1, 2]) {
    assert.throws(() => figure({ width: Number.MAX_VALUE, height: Number.MAX_VALUE, gap: Number.MAX_VALUE / 2, columns })
      .heatmap({ data: [[1]] }).heatmap({ data: [[2]] }).render(), /panel positions must be finite/);
  }
});


test('zero-total donuts and both rectangular empty heatmap shapes still obey chart bounds', () => {
  for (const items of [[], [{ name: 'zero', value: 0 }]]) {
    assert.throws(() => figure({ width: 40, height: 100 }).donut({ items }).render(), RangeError);
  }
  for (const data of [[], [[]], [[], []]]) {
    assert.throws(() => figure({ width: 20, height: 100 }).heatmap({ data }).render(), RangeError);
    assert.throws(() => figure({ width: 100, height: 26 }).heatmap({ data, xLabels: [] }).render(), RangeError);
  }
});

test('immediately adjacent representable values above each positive bound remain supported', () => {
  const buffer = new ArrayBuffer(8), bits = new DataView(buffer);
  const nextUp = (value: number) => {
    bits.setFloat64(0, value);
    bits.setBigUint64(0, bits.getBigUint64(0) + 1n);
    return bits.getFloat64(0);
  };
  for (const sample of panelCases.filter(s => s.type !== 'gauge')) {
    assert.doesNotThrow(() => sample.render(nextUp(sample.minWidth), nextUp(sample.minHeight)));
  }
});

test('large dimensions remain accepted when their actual layout stays finite and positive', () => {
  const results = {
    'large/radar': figure({ width: Number.MAX_VALUE / 2, height: Number.MAX_VALUE / 2 }).radar({ axes: [], series: [] }).render(),
    'large/empty-column': figure({ width: 1e20, height: 100 }).bar({ categories: [], series: [] }).render(),
    ...Object.fromEntries([1, 2].map(columns => [`large/grid-${columns}`, figure({ width: Number.MAX_VALUE, height: Number.MAX_VALUE, gap: 0, columns })
      .heatmap({ data: [[1]] }).heatmap({ data: [[2]] }).render()])),
  };
  for (const [key, result] of Object.entries(results)) {
    assert.doesNotMatch(result, /NaN|Infinity/);
    assert.equal(sha(result), golden[key]);
  }
});
