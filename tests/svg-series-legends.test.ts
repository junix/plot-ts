import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES, getCanonicalTheme, type ColumnChart, type LineChart } from '../src/svg/index.js';
import { renderColumn, renderLine } from '../src/svg/charts.js';
import { SvgMotionPlan } from '../src/svg/motion.js';
import { seriesTone } from '../src/svg/context.js';
import { esc, n } from '../src/util/html.js';
import { estimateTextWidth } from '../src/util/scale.js';
import { columnLegend, lineLegend, legendFixtureOptions, legendFixtures, legacyNamedFixtures } from './fixtures/svg-series-legends.js';
import { parseDocument, checkStylesheet } from './helpers/html-document.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const legends = (s: string) => [...s.matchAll(/<g data-plot-legend="series-names-v1"[^>]*>.*?<\/g>/gs)].map(m => m[0]);
const textContents = (s: string) => [...s.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(m => m[1]);
const noLegend = <T extends ColumnChart | LineChart>(c: T): T => { const copy = { ...c }; delete copy.legend; return copy; };
const goldens = JSON.parse(readFileSync(new URL('./fixtures/svg-series-legends-golden.json', import.meta.url), 'utf8'));

for (const [chart, render] of [[columnLegend, renderColumn], [lineLegend, renderLine]] as const) {
  test(`${chart.type}: full escaped names occur once, in source order; body equals the exact reduced-height old renderer`, () => {
    for (const theme of [undefined, ...CANONICAL_THEME_NAMES.map(getCanonicalTheme)]) {
      const output = render(chart as any, 400, 250, theme);
      const body = render(noLegend(chart) as any, 400, 198, theme);
      assert.ok(output.includes(`viewBox="0 0 400 250">${body}<g data-plot-legend=`));
      const [legend] = legends(output);
      assert.ok(legend!.includes('transform="translate(0, 198)"'));
      assert.deepEqual(textContents(legend!), chart.series.map(s => esc(s.name!)));
      for (const s of chart.series) assert.equal(output.split(esc(s.name!)).length - 1, 1);
      assert.doesNotMatch(legend!, /plt-grow|plt-fade|data-plot-motion|@keyframes|<title|<style/);
      parseDocument(output);
    }
  });

  test(`${chart.type}: omitted legend still ignores all names, including formerly accepted malformed names`, () => {
    const plain = noLegend(chart);
    const expected = render({ ...plain, series: chart.series.map(({ name, ...s }) => s) } as any, 400, 250);
    for (const name of [undefined, '', 'name', '\ud800', '<script>', null, 123, 'x'.repeat(200)]) {
      assert.equal(render({ ...plain, series: plain.series.map(s => ({ ...s, name })) } as any, 400, 250), expected);
    }
    assert.equal(render({ ...plain, legend: undefined } as any, 400, 250), expected);
  });

  test(`${chart.type}: complete name or actionable rejection, without mutating input`, () => {
    const badNames = [undefined, null, false, 123, '', ' \t\n', 'x'.repeat(129), '\ud800', '\udfff', '\u0000', '\u000b', '\ufffe', '\uffff', 'a\tb', 'a\nb', 'a\rb', 'a\u2028b', 'a\u2029b'];
    for (const name of badNames) {
      const config = { ...chart, series: chart.series.map(s => ({ ...s, name })) } as any;
      const before = structuredClone(config);
      assert.throws(() => render(config, 2000, 500), { name: 'RangeError' });
      assert.deepEqual(config, before);
    }
    for (const legend of [null, true, false, '', 'series-names', 'series-names-v2', 1, {}]) {
      assert.throws(() => render({ ...chart, legend } as any, 400, 250), /legend must be 'series-names-v1'/);
    }
    for (const series of [[], null, {}, 'not an array']) assert.throws(() => render({ ...chart, series } as any, 400, 250), /1–8 series/);
    assert.throws(() => render(chart as any, 400, 1e20), /reservation loses numeric precision; reduce the panel height/);
    assert.throws(() => render({ ...chart, series: Array(9).fill(chart.series[0]) } as any, 400, 250), /1–8 series/);
    assert.throws(() => render({ ...chart, series: [chart.series[0], chart.series[0]] } as any, 400, 250), /exactly distinct/);
    assert.throws(() => render({ ...chart, series: [undefined] } as any, 400, 250), /series\[0\].name/);
    assert.throws(() => render({ ...chart, series: Array(1) } as any, 400, 250), /series\[0\].name/);
    assert.throws(() => render(chart as any, 40, 250), /increase the panel width or shorten the name/);
    assert.throws(() => render(chart as any, 400, 98), /reserves 52 pixels.*increase the panel size or reduce the number of series/);
    for (const [width, height] of [[0, 250], [400, Infinity], [NaN, 250], [400, 0]]) {
      assert.throws(() => render(chart as any, width!, height!), /finite positive/);
    }
  });
}

test('scalar limits, single-line whitespace, XML escaping, and serialized text advances are explicit', () => {
  const names = ['  spaced  name  ', 'é'.repeat(128), '😀'.repeat(128), 'e\u0301', '"quoted" <&>'];
  for (const name of names) {
    const c = { ...lineLegend, series: [{ name, y: [1] }] };
    const svg = renderLine(c, 2000, 200);
    assert.deepEqual(textContents(legends(svg)[0]!), [esc(name)]);
    assert.match(legends(svg)[0]!, /xml:space="preserve"/);
    assert.ok(svg.includes(`textLength="${n(estimateTextWidth(name, 11))}" lengthAdjust="spacingAndGlyphs"`));
  }
  assert.throws(() => renderLine({ ...lineLegend, series: [{ name: '😀'.repeat(129), y: [] }] }, 2000, 200), /128 Unicode scalars and 512 UTF-8 bytes/);
  const c = { ...lineLegend, series: [{ name: 'A', y: [] }] };
  const width = 36 + 6.6;
  assert.doesNotThrow(() => renderLine(c, width, 81));
  assert.throws(() => renderLine(c, width - 0.000001, 81), /does not fit/);
  for (const height of [81.00001, 100.009, 190.007, 250.009]) assert.doesNotThrow(() => renderLine(c, 100, height));
  for (const width of [42.6, 100.004, 160.001, 320.009]) {
    const svg = renderLine(c, width, 200);
    for (const m of legends(svg)[0]!.matchAll(/<text x="([^"]+)"[^>]*textLength="([^"]+)"/g)) {
      assert.ok(Number(m[1]) + Number(m[2]) <= width - 8);
    }
  }
});

test('legacy column swatches preserve actual opacity; line swatches match strokes and reject repeated ink', () => {
  const series = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, values: [i + 1], y: [i + 1, i + 2] }));
  const columns = renderColumn({ ...columnLegend, series }, 400, 300);
  const swatches = [...legends(columns)[0]!.matchAll(/<rect\b[^>]*>/g)].map(m => m[0]);
  assert.equal(swatches.length, 8);
  for (let i = 0; i < 8; i++) {
    const tone = seriesTone(i);
    assert.ok(swatches[i]!.includes(`fill="${tone.color}"`));
    assert.equal(/opacity="([^"]+)"/.exec(swatches[i]!)?.[1] ?? '1', String(tone.opacity));
  }
  for (let count = 1; count <= 3; count++) {
    const output = renderLine({ ...lineLegend, series: series.slice(0, count) }, 400, 300);
    const swatches = [...legends(output)[0]!.matchAll(/<line\b[^>]*>/g)].map(m => m[0]);
    for (let i = 0; i < count; i++) assert.ok(swatches[i]!.includes(`stroke="${seriesTone(i).color}" stroke-width="2"`));
    assert.doesNotMatch(legends(output)[0]!, /opacity/);
  }
  assert.throws(() => renderLine({ ...lineLegend, series: series.slice(0, 4) }, 400, 300), /identical visible encodings; choose a canonical theme or fewer series/);
  for (const name of CANONICAL_THEME_NAMES) {
    const theme = getCanonicalTheme(name);
    for (const count of [4, 8]) {
      const output = renderLine({ ...lineLegend, series: series.slice(0, count) }, 400, 300, theme);
      assert.deepEqual([...legends(output)[0]!.matchAll(/stroke="([^"]+)"/g)].map(m => m[1]), theme.series.slice(0, count));
    }
  }
  const repeated = { ...getCanonicalTheme('sage'), series: ['#000000', '#000000'] };
  for (const [c, render] of [[columnLegend, renderColumn], [lineLegend, renderLine]] as const) {
    assert.throws(() => render(c as any, 400, 300, repeated as any), /identical visible encodings/);
  }
});

test('empty valid series retain their legends; actual body minimum depends on chart options', () => {
  assert.equal(legends(renderColumn({ ...columnLegend, categories: [], series: [{ name: 'Empty', values: [] }] }, 100, 81)).length, 1);
  assert.equal(legends(renderLine({ ...lineLegend, x: [], series: [{ name: 'Empty', y: [] }] }, 100, 81)).length, 1);
  const column = { ...columnLegend, labels: false, series: [{ name: 'A', values: [] }] };
  assert.doesNotThrow(() => renderColumn(column, 100, 67));
  assert.throws(() => renderColumn({ ...column, labels: true }, 100, 67), /after margins.*reserves 34 pixels/);
  assert.throws(() => renderLine({ ...lineLegend, series: [{ name: 'A', y: [] }] }, 100, 80), /after margins/);
  assert.throws(() => renderLine({ ...lineLegend, series: [{ name: 'A', y: [] }] }, 100, 34), /finite positive.*reserves 34 pixels/);
});

test('per-panel placement reserves names exactly once below the figure title and respects surface policies', () => {
  for (const surfacePolicy of SURFACE_POLICIES) {
    const output = figure({ width: 816, height: 340, title: 'Report', columns: 2, gap: 16, theme: 'sage-dark', surfacePolicy })
      .bar(columnLegend).line({ ...lineLegend, series: lineLegend.series.slice(0, 1) }).render();
    assert.deepEqual(legends(output).map(s => /translate\(0, ([^)]+)\)/.exec(s)![1]), ['248', '266']);
    assert.ok(output.includes('transform="translate(0, 40)"'));
    assert.ok(output.includes('data-panel-index="1" data-chart-type="line" transform="translate(416, 0)"'));
    for (const legend of legends(output)) {
      assert.ok(legend.includes(`fill="${getCanonicalTheme('sage-dark').tokens['--ink']}"`));
      assert.doesNotMatch(legend, /data-plot-surface|fill="none"/);
    }
  }
  assert.throws(() => figure({ width: 336, height: 120, columns: 2 }).bar({ ...columnLegend, series: Array.from({ length: 4 }, (_, i) => ({ name: `S${i}`, values: [1] })) }).line(noLegend(lineLegend)).render(), /reserves 88 pixels.*increase the panel size/);
});

test('legends stay static across render/HTML/frames and reduced motion; body alone owns the target budget', () => {
  const opts = { width: 400, height: 250 };
  const plain = figure(opts).bar(columnLegend).render();
  const f = figure({ ...opts, animated: true }).bar(columnLegend);
  const expectedLegend = legends(plain);
  for (const output of [f.render(), f.renderHtml(), ...[0, 50, 150, 600, 1600, 150, 0].map(t => f.renderFrame(t)), f.renderFrame(0, { reducedMotion: true })]) {
    assert.deepEqual(legends(output), expectedLegend);
    parseDocument(output);
  }
  assert.equal(f.renderFrame(1600), plain);
  assert.equal(f.renderFrame(0, { reducedMotion: true }), plain);
  assert.equal(f.renderFrame(150), figure(opts).bar(columnLegend).renderFrame(150));
  assert.doesNotMatch(plain, /<style|data-plot-motion|@keyframes/);
  checkStylesheet(f.renderHtml());
  const bodyMotion = new SvgMotionPlan();
  const body = renderColumn(noLegend(columnLegend), 400, 198, undefined, bodyMotion);
  const actualMotion = new SvgMotionPlan();
  const actual = renderColumn(columnLegend, 400, 250, undefined, actualMotion);
  assert.ok(actual.includes(body));
  assert.equal(bodyMotion.endMs, actualMotion.endMs);
  const config = (n: number) => ({ legend: 'series-names-v1' as const, labels: false, categories: Array(n).fill(''), series: [{ name: 'A', values: Array(n).fill(1) }] });
  const atLimit = figure(opts).bar(config(2048)).renderFrame(0);
  assert.equal((atLimit.match(/data-plot-motion-target=/g) ?? []).length, 2048);
  assert.equal(legends(atLimit).length, 1);
  const dense = figure(opts).bar(config(2049));
  assert.throws(() => dense.renderFrame(0), /2048 rendered targets/);
  assert.equal(dense.renderFrame(1600), dense.render());
  assert.equal(dense.renderFrame(0, { reducedMotion: true }), dense.render());
  assert.deepEqual(legends(dense.renderHtml()), legends(dense.render()));
  assert.doesNotMatch(dense.renderHtml(), /data-plot-motion/);
  const line = figure(opts).line(lineLegend);
  assert.equal(line.renderFrame(0), line.render());
  assert.ok(line.renderHtml().includes(line.render()));
});

test('legend-reduced height determines actual emitted labels and motion counts', () => {
  const c = { ...columnLegend, categories: ['A'], yAxis: false, series: [{ name: 'A', values: [1] }], max: 10 };
  const direct = new SvgMotionPlan();
  const withLegend = renderColumn(c, 400, 200, undefined, direct);
  const unreserved = renderColumn(noLegend(c), 400, 200, undefined, new SvgMotionPlan());
  assert.equal((withLegend.match(/data-plot-motion-target=/g) ?? []).length, 1, '12px mark is below the label threshold after reserve');
  assert.equal((unreserved.match(/data-plot-motion-target=/g) ?? []).length, 2, '15.4px mark previously emitted a value label');
});

test('explicit legend goldens cover legacy and 14 canonical themes across every surface policy', () => {
  let count = 0;
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
    for (const [name, make] of legendFixtures) {
      const output = make(figure({ ...legendFixtureOptions, ...(theme ? { theme } : {}), surfacePolicy })).render();
      assert.equal(hash(output), goldens.hashes[[theme ?? 'legacy', surfacePolicy, name].join('/')]);
      count++;
    }
  }
  assert.equal(count, 180);
});

test('180 pre-existing named-series outputs without the profile equal the b23ca8a source goldens', () => {
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
    for (const [name, make] of legacyNamedFixtures) {
      const output = make(figure({ ...legendFixtureOptions, ...(theme ? { theme } : {}), surfacePolicy })).render();
      assert.equal(hash(output), goldens.legacyNamedHashes[[theme ?? 'legacy', surfacePolicy, name].join('/')]);
    }
  }
});

test('all figure entry paths share strict legend validation and leave frozen source records unchanged', () => {
  const values = Object.freeze([2, -1]), series = Object.freeze([Object.freeze({ name: 'A', values })]);
  const config = Object.freeze({ categories: Object.freeze(['甲', '乙']), series, legend: 'series-names-v1' });
  const f = figure().bar(config as any);
  const plain = f.render();
  for (const render of [() => f.render(), () => f.renderHtml(), () => f.renderFrame(0), () => f.renderFrame(1600), () => f.renderFrame(0, { reducedMotion: true })]) {
    assert.doesNotThrow(render);
  }
  assert.equal(f.render(), plain);
  for (const mode of ['column', 'line']) {
    const invalid = figure();
    if (mode === 'column') invalid.bar({ ...columnLegend, legend: null } as any);
    else invalid.line({ ...lineLegend, legend: null } as any);
    for (const render of [() => invalid.render(), () => invalid.renderHtml(), () => invalid.renderFrame(0), () => invalid.renderFrame(1600), () => invalid.renderFrame(0, { reducedMotion: true })]) {
      assert.throws(render, /legend must be 'series-names-v1'/);
    }
  }
});
