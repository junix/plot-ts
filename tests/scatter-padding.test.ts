import { embeddedSvg, semanticMarks } from './helpers/svg-motion.js';
import { getCanonicalTheme } from '../src/style/canonical.js';
import { generateStyles, generateFigureStyles, palette } from '../src/style/tokens.js';
import { svgMotionCss } from '../src/svg/motion.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { figure, type ScatterChart } from '../src/svg/index.js';
import { renderScatter } from '../src/svg/charts.js';
import { svg } from '../src/index.js';

const corners = (size: number): ScatterChart['points'] => [
  { x: -5, y: -10, size }, { x: 5, y: -10, size },
  { x: -5, y: 10, size }, { x: 5, y: 10, size },
];
const parse = (output: string) => [...output.matchAll(/<circle\b([^>]*)>/g)].map(([, attrs]) => {
  const attr = (key: string) => Number(attrs!.match(new RegExp(`\\b${key}="([^"]+)"`))![1]);
  return { x: attr('cx'), y: attr('cy'), r: attr('r') };
});
function contained(output: string, width: number, height: number): void {
  assert.doesNotMatch(output, /NaN|Infinity/);
  for (const { x, y, r } of parse(output)) {
    assert.ok(r <= x && r <= width - x && r <= y && r <= height - y, JSON.stringify({ x, y, r, width, height }));
  }
}

for (const yAxis of [false, true]) {
  for (const size of [10, 10.001, 15, 24, 30, 45.555]) {
    test(`radius ${size}, yAxis=${yAxis}: all four extrema fit without changing radii or order`, () => {
      const points = corners(size), before = structuredClone(points);
      const output = renderScatter({ type: 'scatter', points, yAxis }, 300, 200);
      contained(output, 300, 200);
      assert.deepEqual(points, before);
      assert.deepEqual(parse(output).map(p => p.r), points.map(p => Number(p.size!.toFixed(2))));
      assert.deepEqual([...output.matchAll(/style="--i:(\d+)"/g)].map(m => Number(m[1])), [0, 1, 2, 3]);
      assert.ok(parse(output)[0]!.x < parse(output)[1]!.x);
      assert.ok(parse(output)[0]!.y > parse(output)[2]!.y);
      assert.doesNotMatch(output, /<circle[^>]*stroke/);
    });
  }
}

test('radius15 uses marker bounds while retaining inferred domains and larger legacy margins', () => {
  const output = renderScatter({ type: 'scatter', points: [...corners(15), { x: 0, y: 0, size: 4 }], yAxis: true }, 300, 200);
  assert.deepEqual(parse(output), [
    { x: 30, y: 176, r: 15 }, { x: 284.99, y: 176, r: 15 },
    { x: 30, y: 15.01, r: 15 }, { x: 284.99, y: 15.01, r: 15 },
    { x: 157.5, y: 95.5, r: 4 },
  ]);
});

test('variable radii reserve the largest finite-pair radius and preserve omitted indices', () => {
  const points = [
    { x: -5, y: -10, size: 4 }, { x: NaN, y: 0, size: Number.MAX_VALUE },
    { x: 5, y: 10, size: 15 }, { x: 0, y: 0, size: 40 },
    { x: 2, y: -2, size: 0 },
  ];
  const output = renderScatter({ type: 'scatter', points }, 300, 200);
  contained(output, 300, 200);
  assert.deepEqual(parse(output).map(p => p.r), [4, 15, 40, 0]);
  assert.deepEqual([...output.matchAll(/style="--i:(\d+)"/g)].map(m => Number(m[1])), [0, 2, 3, 4]);
  assert.equal(parse(output)[2]!.x, 150);
  assert.equal(parse(output)[2]!.y, 100);
});

for (const yAxis of [false, true]) {
  for (const value of [-10, 0, 10]) {
    test(`single point radius35 at ${value}, yAxis=${yAxis} remains centered in its drawable area`, () => {
      const output = renderScatter({ type: 'scatter', points: [{ x: value, y: 10, size: 35 }], yAxis }, 300, 200);
      contained(output, 300, 200);
      assert.deepEqual(parse(output), [{ x: 150, y: 100, r: 35 }]);
    });
  }
}

for (const [size, yAxis, minWidth, minHeight] of [
  [15, false, 30.02, 39.01], [15, true, 45.01, 39.01], [35, false, 70.02, 70.02],
] as const) {
  test(`radius${size}/axis${yAxis}: strict marker-aware drawable boundaries`, () => {
    const config: ScatterChart = { type: 'scatter', points: corners(size), yAxis };
    for (const [width, height] of [[minWidth - 0.01, 200], [300, minHeight - 0.01], [minWidth, minHeight]]) {
      assert.throws(() => renderScatter(config, width!, height!), RangeError);
    }
    const output = renderScatter(config, minWidth + 0.02, minHeight + 0.02);
    contained(output, minWidth + 0.02, minHeight + 0.02);
  });
}

for (const size of [10.004, 10.005, 15.004, 15.005, 24.005, 30.999]) {
  test(`fractional radius${size} and fractional viewport retain emitted ink bounds`, () => {
    for (const width of [100.001, 100.006, 100.999]) {
      const output = renderScatter({ type: 'scatter', points: corners(size) }, width, 80.006);
      contained(output, width, 80.006);
    }
  });
}

for (const size of [-1, NaN, Infinity, -Infinity]) {
  test(`invalid radius${size} rejects finite pairs and still omits nonfinite pairs`, () => {
    assert.throws(() => renderScatter({ type: 'scatter', points: [{ x: 0, y: 0, size }] }, 300, 200), /size must be finite and non-negative/);
    assert.doesNotThrow(() => renderScatter({ type: 'scatter', points: [{ x: NaN, y: 0, size }] }, 300, 200));
  });
}

test('oversized finite radii and lost floating-point insets reject instead of clipping', () => {
  for (const size of [100, 150, 1e100, Number.MAX_VALUE]) {
    for (const entry of [figure, svg.figure]) {
      const chart = entry({ width: 300, height: 200 }).scatter({ points: [{ x: 1, y: 1, size }] });
      assert.throws(() => chart.render(), RangeError);
      assert.throws(() => chart.renderHtml(), RangeError);
    }
  }
  assert.throws(() => renderScatter({ type: 'scatter', points: corners(4) }, Number.MAX_VALUE, 200), /markers must fit/);
});

test('zero and subnormal radius serialization remains unchanged', () => {
  const output = renderScatter({ type: 'scatter', points: [0, -0, Number.MIN_VALUE, 0.004].map((size, x) => ({ x, y: 10, size })) }, 300, 200);
  contained(output, 300, 200);
  assert.deepEqual(parse(output).map(p => p.r), [0, 0, 0, 0]);
});

test('composition validates actual titled/gapped panel dimensions and keeps each viewport independent', () => {
  const make = (size: number) => figure({ width: 336, height: 160, title: 'Panels', gap: 16, columns: 2 })
    .scatter({ points: corners(size) }).scatter({ points: corners(size) });
  const output = make(45).render();
  const panels = [...output.matchAll(/<svg xmlns[^>]*width="160" height="120"[^>]*>(.*?)<\/svg>/g)];
  assert.equal(panels.length, 2);
  for (const panel of panels) contained(panel[1]!, 160, 120);
  assert.throws(() => make(60).render(), RangeError);
  assert.throws(() => make(60).renderHtml(), RangeError);
});

test('legacy-safe fixtures retain exact SVG and HTML bytes outside the scoped motion replacement', () => {
  const records = JSON.parse(readFileSync(new URL('./fixtures/scatter-padding-golden.json', import.meta.url), 'utf8'));
  for (const record of records) {
    const report = figure(record.options).scatter(record.config);
    let bytes = report.render();
    if (record.html) {
      const html = report.renderHtml();
      assert.deepEqual(semanticMarks(html), semanticMarks(bytes));
      // Keep the old HTML hashes. Reverse only the explicitly changed motion
      // wrapper/CSS contract; every other HTML byte remains baseline-locked.
      const theme = record.options.theme ? getCanonicalTheme(record.options.theme) : undefined;
      const colors = theme ? { ink: theme.tokens['--ink'], accent: theme.tokens['--accent'], paper: theme.tokens['--paper'], neutral: theme.tokens['--grid'] } : palette();
      const newRules = generateFigureStyles(colors, false, false).slice(7, -8) + svgMotionCss();
      const oldRules = generateStyles(colors).slice(7, -8);
      bytes = html.replace(embeddedSvg(html), bytes).replace(newRules, oldRules);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, record.name);
  }
});

test('exact decimal edge remains contained without moving legacy-safe marks', () => {
  const output = renderScatter({ type: 'scatter', points: [{ x: 0, y: 0, size: 10 }, { x: 1, y: 10, size: 10 }] }, 40.01, 100);
  assert.deepEqual(parse(output), [{ x: 10, y: 76, r: 10 }, { x: 30.01, y: 10, r: 10 }]);
});

test('genuine fractional-edge rounding overflow gets a bounded inset retry', () => {
  const output = renderScatter({ type: 'scatter', points: [{ x: 0, y: 0, size: 10 }, { x: 1, y: 10, size: 10 }] }, 100.006, 80.006);
  contained(output, 100.006, 80.006);
  assert.deepEqual(parse(output).map(p => p.r), [10, 10]);
  assert.equal(parse(output)[1]!.x, 100 - 10);
});


test('fractional correction changes only overflowing sides at rounding thresholds', () => {
  const config: ScatterChart = { type: 'scatter', points: [{ x: 0, y: 0, size: 10 }, { x: 1, y: 10, size: 10 }] };
  for (const width of [100.004, 100.005, 100.006, 100.009, 100.01]) {
    const points = parse(renderScatter(config, width, 80));
    assert.equal(points[0]!.x, 10, 'safe left margin stays unchanged');
    assert.equal(points[0]!.y, 56, 'safe bottom margin stays unchanged');
    assert.equal(points[1]!.y, 10, 'safe top margin stays unchanged');
    assert.ok(points[1]!.x + points[1]!.r <= width);
  }
  const output = renderScatter({ type: 'scatter', points: corners(24) }, 300, 100.006);
  assert.equal(parse(output)[0]!.y, 76, 'overflowing bottom moves in by one serialized increment');
  assert.equal(parse(output)[2]!.y, 24.01, 'already padded top remains unchanged');
  assert.equal(parse(output)[0]!.x, 24.01, 'left remains unchanged');
  assert.equal(parse(output)[1]!.x, 275.99, 'right remains unchanged');
});

test('translated fractional grid panels use local viewport bounds on both axes', () => {
  const report = figure({ width: 336.012, height: 296.012, title: 'Panels', columns: 2, gap: 16 });
  for (const size of [10, 24, 10, 24]) report.scatter({ points: corners(size) });
  const output = report.render();
  const panels = [...output.matchAll(/<g data-panel-index="(\d+)" data-chart-type="scatter" transform="translate\(([^,]+), ([^)]+)\)"><svg[^>]*width="([^"]+)" height="([^"]+)"[^>]*>(.*?)<\/svg>/g)];
  assert.equal(panels.length, 4);
  for (const panel of panels) {
    const width = Number(panel[4]), height = Number(panel[5]);
    for (const point of parse(panel[6]!)) {
      assert.ok(point.x >= point.r && point.x + point.r <= width);
      assert.ok(point.y >= point.r && point.y + point.r <= height);
    }
  }
  assert.ok(Number(panels[1]![2]) > 0 && Number(panels[2]![3]) > 0);
  assert.throws(() => renderScatter({ type: 'scatter', points: corners(10) }, 20, 100), RangeError);
});
