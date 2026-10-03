import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type SvgFigure, type SvgFigureOptions } from '../src/svg/index.js';
import {
  renderColumn, renderLine, renderScatter, renderHeatmap, renderWaterfall,
  renderDonut, renderRadar, renderGauge, renderSlope, renderPyramid,
} from '../src/svg/charts.js';
import { esc, h, join } from '../src/util/html.js';

const column = { type: 'column' as const, categories: ['A', 'B'], series: [{ values: [2, 5] }] };
const line = { type: 'line' as const, x: [0, 1, 2], series: [{ y: [2, 5, 3] }] };
const scatter = { type: 'scatter' as const, points: [{ x: 0, y: 2 }, { x: 1, y: 5 }] };
const heatmap = { type: 'heatmap' as const, data: [[1, 2], [3, 4]] };
const waterfall = { type: 'waterfall' as const, categories: ['A', 'B'], values: [2, 3] };
const donut = { type: 'donut' as const, items: [{ name: 'A', value: 2 }, { name: 'B', value: 3 }] };
const radar = { type: 'radar' as const, axes: [{ name: 'A', max: 5 }, { name: 'B', max: 5 }, { name: 'C', max: 5 }], series: [{ values: [2, 3, 4] }] };
const gauge = { type: 'gauge' as const, value: 40, max: 100 };
const slope = { type: 'slope' as const, items: [{ name: 'A', left: 2, right: 4 }] };
const pyramid = { type: 'pyramid' as const, layers: [{ name: 'A', value: 4 }, { name: 'B', value: 2 }] };

const samples = [
  { type: 'column', add: (f: SvgFigure) => f.bar(column), render: (w: number, h: number) => renderColumn(column, w, h) },
  { type: 'line', add: (f: SvgFigure) => f.line(line), render: (w: number, h: number) => renderLine(line, w, h) },
  { type: 'scatter', add: (f: SvgFigure) => f.scatter(scatter), render: (w: number, h: number) => renderScatter(scatter, w, h) },
  { type: 'heatmap', add: (f: SvgFigure) => f.heatmap(heatmap), render: (w: number, h: number) => renderHeatmap(heatmap, w, h) },
  { type: 'waterfall', add: (f: SvgFigure) => f.waterfall(waterfall), render: (w: number, h: number) => renderWaterfall(waterfall, w, h) },
  { type: 'donut', add: (f: SvgFigure) => f.donut(donut), render: (w: number, h: number) => renderDonut(donut, w, h) },
  { type: 'radar', add: (f: SvgFigure) => f.radar(radar), render: (w: number, h: number) => renderRadar(radar, w, h) },
  { type: 'gauge', add: (f: SvgFigure) => f.gauge(gauge), render: (w: number, h: number) => renderGauge(gauge, w, h) },
  { type: 'slope', add: (f: SvgFigure) => f.slope(slope), render: (w: number, h: number) => renderSlope(slope, w, h) },
  { type: 'pyramid', add: (f: SvgFigure) => f.pyramid(pyramid), render: (w: number, h: number) => renderPyramid(pyramid, w, h) },
];

function legacyWrapper(content: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  ${content}
</svg>`;
}

for (const sample of samples) {
  test(`single ${sample.type} keeps the previous exact SVG markup`, () => {
    for (const title of ['', 'Sales <2026> & growth']) {
      const titleH = title ? 40 : 0;
      const titleElem = title ? h('text', {
        x: 400, y: 28, 'text-anchor': 'middle', 'font-size': 18,
        'font-weight': 700, fill: '#051C2C',
      }, esc(title)) : '';
      const expected = legacyWrapper(join(titleElem,
        h('g', { transform: `translate(0, ${titleH})` }, sample.render(800, 500 - titleH))), 800, 500);
      assert.equal(sample.add(figure({ title })).render(), expected);
      assert.equal(sample.add(figure({ title, columns: 20, gap: 1000 })).render(), expected);
    }
  });
}

test('a mixed grid retains all ten chart families in insertion order', () => {
  const f = figure({ width: 1600, height: 1200 });
  for (const sample of samples) sample.add(f);
  const result = f.render();
  const panels = [...result.matchAll(/data-panel-index="(\d+)" data-chart-type="([^"]+)"/g)];
  assert.deepEqual(panels.map(match => [Number(match[1]), match[2]]),
    samples.map((sample, index) => [index, sample.type]));
  assert.equal((result.match(/<svg /g) ?? []).length, 11);
  assert.doesNotMatch(result, /NaN|Infinity/);
  assert.equal(f.render(), result);
});

test('default four-chart grid has independent 392 by 222 viewports below the title', () => {
  const result = figure({ title: 'Overview' }).bar(column).line(line).scatter(scatter).heatmap(heatmap).render();
  assert.ok(result.includes('transform="translate(0, 40)"'));
  for (const [index, type, x, y] of [
    [0, 'column', 0, 0], [1, 'line', 408, 0],
    [2, 'scatter', 0, 238], [3, 'heatmap', 408, 238],
  ]) {
    assert.ok(result.includes(`data-panel-index="${index}" data-chart-type="${type}" transform="translate(${x}, ${y})"`));
  }
  assert.equal((result.match(/width="392" height="222" viewBox="0 0 392 222"/g) ?? []).length, 4);
});

test('explicit columns, zero gap and incomplete rows are deterministic', () => {
  const f = figure({ width: 400, height: 600, columns: 1, gap: 0 })
    .bar(column).line(line).heatmap(heatmap);
  for (const y of [0, 200, 400]) assert.ok(f.render().includes(`transform="translate(0, ${y})"`));
  const incomplete = figure({ width: 800, height: 500, columns: 2, gap: 20 })
    .bar(column).line(line).heatmap(heatmap).render();
  assert.ok(incomplete.includes('data-panel-index="2" data-chart-type="heatmap" transform="translate(0, 260)"'));
  const clamped = figure({ width: 800, height: 500, columns: 20 }).bar(column).line(line).render();
  assert.ok(clamped.includes('width="392" height="500"'));
});

test('empty figures and small single charts do not acquire grid constraints', () => {
  assert.equal(figure({ width: 80, height: 60 }).render(), legacyWrapper('', 80, 60));
  assert.equal(figure({ width: 80, height: 60 }).bar(column).render(),
    legacyWrapper(h('g', { transform: 'translate(0, 0)' }, renderColumn(column, 80, 60)), 80, 60));
});

test('invalid layout options fail clearly', () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => figure({ width: value }), /finite positive/);
    assert.throws(() => figure({ height: value }), /finite positive/);
  }
  for (const columns of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => figure({ columns }), /positive safe integer/);
  }
  for (const gap of [-1, NaN, Infinity]) {
    assert.throws(() => figure({ gap }), /finite non-negative/);
  }
});

test('grids reject insufficient panel space including title and gaps', () => {
  const invalid: SvgFigureOptions[] = [
    { width: 320, height: 500 },
    { width: 800, height: 119 },
    { width: 800, height: 150, title: 'Overview' },
    { width: 800, height: 500, gap: Number.MAX_VALUE },
    { width: 800, height: 240, columns: 1, gap: 1 },
  ];
  for (const options of invalid) {
    assert.throws(() => figure(options).bar(column).line(line).render(), /at least 160 × 120/);
  }
  assert.doesNotThrow(() => figure({ width: 320, height: 120, gap: 0 }).bar(column).line(line).render());
});

test('HTML export contains every panel and escapes the shared title', () => {
  const result = figure({ title: '</title><script>alert(1)</script>' }).bar(column).line(line).renderHtml();
  assert.equal((result.match(/data-panel-index=/g) ?? []).length, 2);
  assert.doesNotMatch(result, /<script>/);
  assert.match(result, /&lt;script&gt;/);
});
