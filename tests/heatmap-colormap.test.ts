import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { figure, type HeatmapChart } from '../src/svg/index.js';

type Config = Omit<HeatmapChart, 'type'>;
const palettes = {
  viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26838e', '#1f9d8a', '#6cce5a', '#b6de2b', '#fde725'],
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
  blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
} as const;
function render(config: Config): string {
  return figure({ width: 300, height: 200 }).heatmap(config).render();
}
function fills(output: string): string[] {
  return [...output.matchAll(/<rect\b[^>]*\bfill="([^"]+)"/g)].map(m => m[1]!);
}
for (const colormap of ['viridis', 'plasma', 'blues'] as const) {
  const palette = palettes[colormap];
  test(`${colormap} selects every exact existing discrete palette entry`, () => {
    const output = render({ data: [palette.map((_, i) => i)], colormap });
    assert.deepEqual(fills(output), [...palette]);
    assert.doesNotMatch(output, /NaN|Infinity|undefined/);
  });
  test(`${colormap} normalizes negative and positive values across the whole matrix`, () => {
    assert.deepEqual(fills(render({ data: [[-5, 0], [5, -5]], colormap })),
      [palette[0], palette[Math.round((palette.length - 1) / 2)], palette.at(-1), palette[0]]);
  });
  for (const value of [0, -4, 3.7]) {
    test(`${colormap} constant ${value} uses its selected midpoint`, () => {
      const output = render({ data: [[value, value], [value, value]], colormap });
      assert.deepEqual(fills(output), Array(4).fill(palette[Math.round((palette.length - 1) / 2)]));
      assert.doesNotMatch(output, /NaN|Infinity|undefined/);
    });
  }
  test(`${colormap} keeps every regular fractional assignment in its palette`, () => {
    const output = render({ data: [Array.from({ length: 101 }, (_, i) => i / 100)], colormap });
    assert.equal(fills(output).length, 101);
    assert.ok(fills(output).every(fill => (palette as readonly string[]).includes(fill)));
    assert.doesNotMatch(output, /NaN|Infinity|undefined/);
  });
  test(`${colormap} keeps labels and cell geometry unchanged`, () => {
    const config = { data: [[1, 2], [3, 4]], xLabels: ['A & B', '<C>'], yLabels: ['one', 'two'] };
    const stripCellFills = (output: string) => output.replace(/(<rect\b[^>]*\bfill=")[^"]+/g, '$1COLOR');
    assert.equal(stripCellFills(render({ ...config, colormap })), stripCellFills(render(config)));
    assert.match(render({ ...config, colormap }), /A &amp; B/);
  });
  for (const data of [[], [[]]]) {
    test(`${colormap} empty data ${JSON.stringify(data)} remains empty`, () => {
      assert.equal(render({ data, colormap }), render({ data }));
    });
  }
}

test('omitted colormap preserves exact original viridis output', () => {
  const config = { data: [[1, 2], [3, 4]] };
  assert.equal(createHash('sha256').update(render(config)).digest('hex'),
    'b089fdbdd4a3fd65574bb09c0adc2ce40e2031ea1abbe11f197876c67286bfda');
  assert.equal(render({ ...config, colormap: 'viridis' }), render(config));
});

test('nearest palette index rounds midpoint ties upward', () => {
  assert.deepEqual(fills(render({ data: [[0, 1 / 18, 1]], colormap: 'plasma' })),
    ['#0d0887', '#46039f', '#f0f921']);
  assert.deepEqual(fills(render({ data: [[0, 1 / 16, 1]], colormap: 'blues' })),
    ['#f7fbff', '#deebf7', '#08306b']);
});

for (const invalid of ['__proto__', 'constructor', 'toString', 'inferno', '', null, 42]) {
  for (const data of [[[0, 1]], []]) {
    test(`reject unsupported runtime colormap ${JSON.stringify(invalid)} with ${data.length} rows`, () => {
      assert.throws(() => render({ data, colormap: invalid as Config['colormap'] & {} }),
        { name: 'RangeError', message: 'Unsupported heatmap colormap. Use viridis, plasma, or blues.' });
    });
  }
}
