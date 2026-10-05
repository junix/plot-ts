import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES, getCanonicalTheme, type Chart, type SvgFigure } from '../src/svg/index.js';
import { svg as rootSvg } from '../src/index.js';
import { renderColumn, renderLine, renderScatter } from '../src/svg/charts.js';
import { numericAxisLabel, numericAxisValues, planNumericAxes } from '../src/svg/numeric-axes.js';
import { xOf, yOf } from '../src/svg/context.js';
import { esc, n } from '../src/util/html.js';
import { validateInput } from '../src/provider/input.js';
import { parseDocument, checkStylesheet } from './helpers/html-document.js';
import { numericAxesColumn, numericAxesLine, numericAxesScatter, numericAxesFixtures } from './fixtures/svg-numeric-axes.js';

const profile = 'numeric-axes-v1' as const;
interface Node { tag: string; attrs: Record<string, string>; start: number; openEnd: number; end: number; raw: string }
/** Structural extraction only, not DOM/font/browser emulation. */
function nodes(source: string): Node[] {
  const output: Node[] = [], stack: Node[] = [];
  const tags = /<(\/?)([a-z][\w:-]*)\b([^<>]*?)(\/?)>/gi;
  for (const match of source.matchAll(tags)) {
    const closing = !!match[1], tag = match[2]!, offset = match.index!;
    if (closing) {
      const node = stack.pop(); assert.equal(node?.tag, tag);
      node!.end = offset + match[0].length; node!.raw = source.slice(node!.start, node!.end);
      continue;
    }
    const attrs = Object.fromEntries([...match[3]!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1]!, m[2]!]));
    const node: Node = { tag, attrs, start: offset, openEnd: offset + match[0].length, end: offset + match[0].length, raw: match[0] };
    output.push(node);
    if (!match[4] && !['meta', 'link', 'br', 'hr', 'img', 'input'].includes(tag)) stack.push(node);
  }
  assert.equal(stack.length, 0);
  return output;
}
const marked = (source: string, key: string, value?: string) => nodes(source).filter(el => Object.hasOwn(el.attrs, key) && (value === undefined || el.attrs[key] === value));
const guides = (source: string) => marked(source, 'data-plot-axes').map(el => el.raw);
const axis = (source: string, key: 'x' | 'y') => {
  const el = marked(source, 'data-plot-axis', key)[0]; assert.ok(el, `missing ${key} axis`); return el;
};
const ticks = (source: string, key: 'x' | 'y') => marked(axis(source, key).raw, 'data-plot-tick-value').map(el => {
  const children = nodes(el.raw), line = children.find(c => c.tag === 'line')!, label = children.find(c => c.tag === 'text')!;
  return { value: Number(el.attrs['data-plot-tick-value']), line: line.attrs, text: label.raw.slice(label.raw.indexOf('>') + 1, -7), attrs: label.attrs };
});
const domains = (source: string, key: 'x' | 'y') => {
  const a = axis(source, key).attrs; return [Number(a['data-domain-min']), Number(a['data-domain-max'])];
};
const add = (f: SvgFigure, c: Chart) => c.type === 'column' ? f.bar(c) : c.type === 'line' ? f.line(c) : c.type === 'scatter' ? f.scatter(c) : f;
const bare = [
  { type: 'column', categories: ['A', 'B'], series: [{ values: [1, 2] }], labels: false },
  { type: 'line', x: [0, 1], series: [{ y: [1, 2] }] },
  { type: 'scatter', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] },
] as const;
const renderers = [renderColumn, renderLine, renderScatter];

function assertGuideSemantics(source: string) {
  for (const a of marked(source, 'data-plot-axis')) {
    const key = a.attrs['data-plot-axis'] as 'x' | 'y', ts = ticks(a.raw, key);
    const min = Number(a.attrs['data-domain-min']), max = Number(a.attrs['data-domain-max']);
    assert.ok(ts.length >= 1 && ts.length <= 6);
    assert.deepEqual(ts.map(t => t.value), [...new Set(ts.map(t => t.value))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0));
    assert.equal(ts[0]!.value, min === 0 ? 0 : min); assert.equal(ts.at(-1)!.value, max === 0 ? 0 : max);
    if (min === max) assert.equal(ts.length, 1);
    if (min < 0 && max > 0) assert.ok(ts.some(t => t.value === 0));
    const positions = ts.map(t => Number(t.line[key === 'x' ? 'x1' : 'y1']));
    assert.equal(new Set(positions).size, ts.length);
    for (const t of ts) {
      assert.equal(Number(t.text.replaceAll(',', '')), t.value);
      assert.ok(t.text.length <= 32); assert.notEqual(t.text, '-0');
      assert.equal(t.line[key === 'x' ? 'x1' : 'y1'], t.attrs[key]);
      assert.equal(t.attrs.lengthAdjust, 'spacingAndGlyphs');
    }
  }
  for (const grid of marked(source, 'data-plot-grid-value')) {
    const value = Number(grid.attrs['data-plot-grid-value']);
    const matching = marked(source, 'data-plot-axis', 'y').flatMap(a => ticks(a.raw, 'y')).filter(t => t.value === value);
    assert.ok(matching.some(t => t.line.y1 === grid.attrs.y1)); assert.equal(grid.attrs.y1, grid.attrs.y2);
  }
  for (const guide of guides(source)) assert.doesNotMatch(guide, /plt-grow|plt-fade|data-plot-motion|<style|@keyframes|<title/);
}

for (const domain of [[0, 1.2], [-3.2, 1], [0, 1e308], [Number.MIN_VALUE, 2 * Number.MIN_VALUE], [-Number.MIN_VALUE, Number.MIN_VALUE], [1e15, 1e15 + 1], [Number.MAX_VALUE, Number.MAX_VALUE], [-0, 0]] as const) {
  test(`bounded finite exact tick candidates ${domain.map(String).join('..')}`, () => {
    for (const intervals of [4, 2, 1] as const) {
      const values = numericAxisValues(domain, intervals);
      assert.ok(values.length <= 6); assert.ok(values.every(Number.isFinite));
      assert.equal(values[0], domain[0] === 0 ? 0 : domain[0]);
      assert.equal(values.at(-1), domain[1] === 0 ? 0 : domain[1]);
      for (const value of values) assert.equal(Number(numericAxisLabel(value).replaceAll(',', '')), value);
    }
  });
}

test('tick candidates clean decimal interiors, never overflow multiplication, and reject invalid domains', () => {
  assert.deepEqual(numericAxisValues([0, 1.2], 4), [0, 0.3, 0.6, 0.9, 1.2]);
  assert.deepEqual(numericAxisValues([Number.MIN_VALUE, 2 * Number.MIN_VALUE], 4), [Number.MIN_VALUE, 2 * Number.MIN_VALUE]);
  assert.deepEqual(numericAxisValues([0, 1e308], 4), [0, 2.5e307, 5e307, 7.5e307, 1e308]);
  for (const domain of [[-1e308, 1e308], [1, 0], [0, Infinity], [NaN, 1]] as const) assert.throws(() => numericAxisValues(domain, 4), RangeError);
});

test('axis formatting round-trips extreme and subnormal values without unit or locale inference', () => {
  for (const value of [0, -0, 0.1, 0.3, 1 / 3, -1 / 3, 1234.5, 1e-12, 1e-100, Number.MIN_VALUE, -Number.MIN_VALUE, 1e15 + 1, 1e308, Number.MAX_VALUE]) {
    const label = numericAxisLabel(value); assert.equal(Number(label.replaceAll(',', '')), value === 0 ? 0 : value);
    assert.ok(label.length <= 32); assert.doesNotMatch(label, /NaN|Infinity|%|\$/);
  }
  assert.equal(numericAxisLabel(1000), '1,000'); assert.equal(numericAxisLabel(Number.MIN_VALUE), '5e-324');
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => numericAxisLabel(value), RangeError);
});

test('one plan places ticks and grids with the actual native mapping of each stored value', () => {
  const domain = [-3.2, 7] as const, x = [0, 1.2] as const;
  const plan = planNumericAxes({ chart: 'line', width: 500, height: 300, y: domain, x, unit: 'mV', xUnit: 's', inset: { top: 22, right: 8, bottom: 24, left: 30 } });
  for (const t of ticks(plan.guides, 'y')) assert.equal(t.line.y1, n(yOf(plan.plot, t.value, ...domain)));
  for (const t of ticks(plan.guides, 'x')) assert.equal(t.line.x1, n(xOf(plan.plot, t.value, ...x)));
  assertGuideSemantics(plan.grid + plan.guides);
});

for (let i = 0; i < bare.length; i++) {
  const c = bare[i]!, render = renderers[i]!;
  test(`${c.type}: omitted profile preserves old ignored fields and explicit undefined`, () => {
    const base = { ...c, yAxis: true }, expected = render(base as any, 400, 250);
    for (const unit of [undefined, null, false, 123, '', 'ms', '\ud800', '<&>', 'x'.repeat(200)]) {
      assert.equal(render({ ...base, unit } as any, 400, 250), expected);
      assert.equal(render({ ...base, axes: undefined, unit } as any, 400, 250), expected);
    }
    if (c.type === 'scatter') for (const xAxis of [undefined, true, false]) assert.equal(render({ ...base, xAxis } as any, 400, 250), expected);
  });
  test(`${c.type}: profile/API rejection is shared by direct, root, HTML and every frame mode`, () => {
    const bad = [
      ...[null, true, false, '', 1, {}, 'numeric-axes', 'numeric-axes-v2'].map(axes => ({ axes })),
      ...[false, null, 0, 'true'].map(yAxis => ({ axes: profile, yAxis })),
      ...['', 's', null, 0].map(xUnit => ({ xUnit })),
      ...(c.type === 'scatter' ? [false, null, 0].map(xAxis => ({ axes: profile, xAxis })) : []),
      ...(c.type === 'column' ? [{ axes: profile, xUnit: 's' }] : []),
    ];
    for (const fields of bad) {
      const config = { ...c, ...fields };
      assert.throws(() => render(config as any, 400, 250), RangeError);
      for (const entry of [figure, rootSvg.figure]) {
        const f = add(entry({ width: 400, height: 250 }), config as any);
        for (const invoke of [() => f.render(), () => f.renderHtml(), () => f.renderFrame(0), () => f.renderFrame(1600), () => f.renderFrame(0, { reducedMotion: true })]) assert.throws(invoke, RangeError);
      }
    }
  });
  test(`${c.type}: explicit profile creates the promised native axes and embeds direct output`, () => {
    const config = { ...c, axes: profile, unit: 'value', ...(c.type === 'column' ? {} : { xUnit: 'time' }) };
    const direct = render(config as any, 400, 250);
    assert.equal(marked(direct, 'data-plot-axis').length, c.type === 'column' ? 1 : 2);
    assertGuideSemantics(direct); parseDocument(direct);
    for (const entry of [figure, rootSvg.figure]) assert.ok(add(entry({ width: 400, height: 250 }), config as any).render().includes(direct));
    assert.equal(render({ ...config, yAxis: true, ...(c.type === 'scatter' ? { xAxis: true } : {}) } as any, 400, 250), direct);
  });
}

test('all supplied units are full escaped literal single-line strings or explicit errors', () => {
  const valid = ['%', '°C', 'µg/m³', 'kg·m²/s²', 'ms', 'USD', '件/日', '请求/秒', '時間（秒）', 'e\u0301', '  a  b  ', '<&>"\'', '😀'.repeat(128)];
  for (const unit of valid) {
    const output = renderLine({ type: 'line', axes: profile, x: [0, 1], series: [{ y: [1, 2] }], unit, xUnit: unit }, 2000, 250);
    const rows = marked(output, 'data-plot-unit'); assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.ok(row.raw.includes(`>${esc(unit)}</text>`)); assert.doesNotMatch(row.raw, /<title|…/);
      assert.match(row.raw, /textLength="[^\"]+" lengthAdjust="spacingAndGlyphs"/);
    }
    assert.match(guides(output)[0]!, /xml:space="preserve"/);
  }
  for (const unit of [null, false, 1, '', ' ', 'a\tb', 'a\nb', 'a\rb', 'a\u2028b', 'a\u2029b', '\ud800', '\udfff', '\u0000', '\u000b', '\ufffe', '\uffff', 'x'.repeat(129), '😀'.repeat(129)]) {
    for (const key of ['unit', 'xUnit']) assert.throws(() => renderLine({ type: 'line', axes: profile, x: [0, 1], series: [{ y: [1, 2] }], [key]: unit } as any, 2000, 250), RangeError);
  }
  assert.throws(() => renderLine({ ...numericAxesLine, unit: 'W'.repeat(128) }, 160, 250), /full ticks and units do not fit/);
  const percent = renderColumn({ ...numericAxesColumn, legend: undefined, format: 'percent', precision: 2, unit: '%' }, 400, 250);
  assert.equal(marked(percent, 'data-plot-unit', 'y').length, 1);
  assert.ok(ticks(percent, 'y').every(t => !t.text.includes('%')));
  assert.deepEqual(domains(percent, 'y'), [0, 50]);
});

test('actual negative, constant, empty and unpaired native domains are shown', () => {
  const line = (x: number[], y: Array<number | null>) => figure().line({ axes: profile, x, series: [{ y }] }).render();
  assert.deepEqual(domains(line([0, 1], [-3, -1]), 'y'), [-3.2, 1]);
  assert.deepEqual(domains(line([0, 1, 99], [1, null]), 'x'), [0, 99]);
  assert.deepEqual(domains(line([0, 1], [0.001, 0.002]), 'y'), [0, 1]);
  const negativeScatter = figure().scatter({ axes: profile, points: [{ x: 0, y: -3 }, { x: 1, y: -1 }, { x: 99, y: NaN, size: -1 }] }).render();
  assert.deepEqual(domains(negativeScatter, 'y'), [-3, 0]); assert.deepEqual(domains(negativeScatter, 'x'), [0, 1]);
  const constant = figure().scatter({ axes: profile, points: [{ x: Number.MAX_VALUE, y: 1 }] }).render();
  assert.equal(ticks(constant, 'x').length, 1); assert.equal(ticks(constant, 'y').length, 1); assertGuideSemantics(constant);
  for (const output of [line([], []), figure().scatter({ axes: profile, points: [] }).render(), figure().bar({ axes: profile, categories: [], series: [{ values: [] }] }).render()]) {
    assertGuideSemantics(output); assert.doesNotMatch(output, /NaN|Infinity|undefined/);
    for (const grid of marked(output, 'data-plot-grid-value')) assert.ok(Number(grid.attrs.x2) - Number(grid.attrs.x1) >= 64);
  }
});

test('signed stacks use separate positive/negative endpoints and one truthful zero baseline', () => {
  const output = figure().bar({ axes: profile, categories: ['A'], series: [{ values: [12] }, { values: [-5] }, { values: [8] }, { values: [-11] }], stacked: true, labels: false }).render();
  assert.deepEqual(domains(output, 'y'), [-20, 20]); assert.equal(ticks(output, 'y').filter(t => t.value === 0).length, 1);
  assert.equal(marked(output, 'data-plot-grid-value', '0').length, 1); assertGuideSemantics(output);
  for (const values of [[1e308, 1e308], [-1e308, -1e308], [1e308, -1e308, 1e308, -1e308]]) assert.throws(() => figure().bar({ axes: profile, categories: ['A'], series: values.map(v => ({ values: [v] })), stacked: true, max: 1 }).render(), /accumulated totals/);
});

test('profile rejects extrapolated/nonfinite maxima and retains native extreme-domain errors', () => {
  for (const max of [1, NaN, Infinity, -Infinity, -1]) {
    assert.throws(() => figure().bar({ axes: profile, categories: ['A'], series: [{ values: [20] }], max }).render(), RangeError);
    assert.throws(() => figure().line({ axes: profile, x: [0, 1], series: [{ y: [1, 20] }], max }).render(), RangeError);
  }
  assert.doesNotThrow(() => figure().bar({ categories: ['A'], series: [{ values: [20] }], max: 1 }).render());
  assert.doesNotThrow(() => figure().line({ x: [0, 1], series: [{ y: [1, 20] }], max: 1 }).render());
  for (const x of [[-1e308, 1e308]]) assert.throws(() => figure().line({ axes: profile, x, series: [{ y: [1, 2] }] }).render(), /domain endpoints and span/);
  for (const value of [Number.MIN_VALUE, Number.MAX_VALUE]) assert.throws(() => figure().bar({ axes: profile, categories: ['A'], series: [{ values: [value] }] }).render(), /inferred maximum/);
  const tiny = figure().bar({ axes: profile, categories: ['A'], series: [{ values: [Number.MIN_VALUE] }], max: Number.MIN_VALUE, labels: false }).render();
  assert.deepEqual(ticks(tiny, 'y').map(t => t.value), [0, Number.MIN_VALUE]); assertGuideSemantics(tiny);
  for (const x of [[Number.MIN_VALUE, 2 * Number.MIN_VALUE], [0, 1e308]]) {
    const output = figure().line({ axes: profile, x, series: [{ y: [1, 2] }] }).render(); assertGuideSemantics(output);
  }
  assert.throws(() => figure().line({ axes: profile, x: [-Number.MIN_VALUE, 1], series: [{ y: [1, 2] }] }).render(), /full ticks and units do not fit/);
});

test('layout thins optional ticks, rejects collisions and preserves fractional and recentered geometry', () => {
  const config = { axes: profile, x: [1000000000001, 1000000000009], series: [{ y: [1, 2] }] };
  const large = figure({ width: 800, height: 250 }).line(config).render();
  const narrow = figure({ width: 400, height: 250 }).line(config).render();
  assert.ok(ticks(narrow, 'x').length < ticks(large, 'x').length); assertGuideSemantics(narrow);
  for (const [width, height] of [[64, 48], [100, 80], [400, 1e20], [1e20, 250]]) assert.throws(() => figure({ width, height }).line({ axes: profile, x: [0, 1], series: [{ y: [1, 2] }] }).render(), RangeError);
  for (const [width, height] of [[400.004, 250.007], [400.009, 250.001], [160.001, 150.009]]) {
    const output = figure({ width, height }).line({ axes: profile, x: [0, 1], series: [{ y: [1, 2] }] }).render(); assertGuideSemantics(output);
  }
  const column = figure({ width: 800, height: 250 }).bar({ axes: profile, categories: ['A'], series: [{ values: [10] }], labels: false }).render();
  const grid = marked(column, 'data-plot-grid-value')[0]!, yTick = ticks(column, 'y')[0]!;
  assert.equal(yTick.line.x1, grid.attrs.x1); assert.ok(Number(grid.attrs.x1) > 100);
  assert.ok(Math.abs(Number(grid.attrs.x2) - Number(grid.attrs.x1) - 64 / 0.42) < 0.02);
  assert.throws(() => figure({ width: 336, height: 120, columns: 2 }).bar(numericAxesColumn).line(numericAxesLine).render(), RangeError);
});

test('scatter marker plus entry-rise envelope stays outside tick/label bands', () => {
  for (const radius of [0, 4, 10, 30.01]) {
    const f = figure({ width: 400.009, height: 300.007 }).scatter({ axes: profile, unit: 'value', xUnit: 'time', points: [{ x: -1, y: -1, size: radius }, { x: 1, y: 1, size: radius }] });
    const plain = f.render(), ys = ticks(plain, 'y'), xs = ticks(plain, 'x');
    const yRule = Number(ys[0]!.line.x1), xRule = Number(xs[0]!.line.y1);
    for (const circle of nodes(plain).filter(n => n.tag === 'circle')) {
      const cx = Number(circle.attrs.cx), cy = Number(circle.attrs.cy), r = Number(circle.attrs.r);
      assert.ok(cx - r >= yRule + 2);
      assert.ok(cy + r + 8 <= xRule - 2);
    }
    for (const time of [0, 150, 600, 1600]) assert.deepEqual(guides(f.renderFrame(time)), guides(plain));
  }
  assert.throws(() => figure({ width: 160, height: 120 }).scatter({ axes: profile, points: [{ x: 0, y: 0, size: 50 }] }).render(), RangeError);
});

test('axis subtrees are identical across static, animated, HTML, backward frames and reduced motion', () => {
  for (const config of [numericAxesColumn, numericAxesLine, numericAxesScatter]) {
    const plain = add(figure({ width: 500, height: 330 }), config).render();
    const f = add(figure({ width: 500, height: 330, animated: true }), config);
    const expected = guides(plain);
    for (const output of [f.render(), f.renderHtml(), ...[0, 50, 150, 600, 1600, 150, 0].map(t => f.renderFrame(t)), f.renderFrame(0, { reducedMotion: true })]) {
      assert.deepEqual(guides(output), expected); parseDocument(output);
    }
    assert.equal(f.renderFrame(1600), plain); assert.equal(f.renderFrame(0, { reducedMotion: true }), plain);
    assert.doesNotMatch(plain, /<style|data-plot-motion|@keyframes/); checkStylesheet(f.renderHtml());
  }
});

test('static guides do not consume 2048/2049 entry targets and layout errors never degrade to missing guides', () => {
  const config = (count: number) => ({ axes: profile, points: Array.from({ length: count }, (_, i) => ({ x: i, y: i % 2 })) });
  const atLimit = figure().scatter(config(2048)).renderFrame(0);
  assert.equal(marked(atLimit, 'data-plot-motion-target').length, 2048); assert.equal(guides(atLimit).length, 1);
  const dense = figure().scatter(config(2049)); assert.throws(() => dense.renderFrame(0), /2048 rendered targets/);
  assert.equal(dense.renderFrame(1600), dense.render()); assert.equal(dense.renderFrame(0, { reducedMotion: true }), dense.render());
  assert.deepEqual(guides(dense.renderHtml()), guides(dense.render())); assert.doesNotMatch(dense.renderHtml(), /data-plot-motion/);
  assert.throws(() => figure({ width: 80, height: 80 }).scatter(config(2049)).renderHtml(), RangeError);
});

test('all 14 canonical themes and every surface policy share exact semantic guide paints', () => {
  let count = 0;
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) for (const [name, make] of numericAxesFixtures) {
    const f = make(figure({ width: 500, height: 330, ...(theme ? { theme } : {}), surfacePolicy }));
    const output = f.render(); parseDocument(output); assertGuideSemantics(output); assert.equal(f.render(), output, name);
    for (const guide of guides(output)) {
      const fill = theme ? getCanonicalTheme(theme).tokens['--ink'] : '#051C2C';
      for (const text of nodes(guide).filter(n => n.tag === 'text')) assert.equal(text.attrs.fill, fill);
      assert.doesNotMatch(guide, /data-plot-surface|<rect/);
    }
    count++;
  }
  assert.equal(count, 270);
});

test('title, independent panels and existing legends reserve axes in the real reduced bodies', () => {
  const opts = { width: 1016, height: 420, columns: 2, title: 'Report', theme: 'sage-dark' as const };
  const output = figure(opts).bar(numericAxesColumn).line(numericAxesLine).render();
  const panels = marked(output, 'data-panel-index'); assert.equal(panels.length, 2);
  assert.ok(panels[0]!.raw.includes(renderColumn(numericAxesColumn, 500, 380, getCanonicalTheme('sage-dark'))));
  assert.ok(panels[1]!.raw.includes(renderLine(numericAxesLine, 500, 380, getCanonicalTheme('sage-dark'))));
  assert.equal(guides(output).length, 2); assert.equal(marked(output, 'data-plot-legend').length, 2);
  assert.deepEqual(domains(panels[0]!.raw, 'y'), [0, 50]); assert.deepEqual(domains(panels[1]!.raw, 'y'), [0, 2.5]);
  assert.match(output, /transform="translate\(0, 40\)"/);
});

test('frozen source arrays are not mutated and later changes are validated on every render', () => {
  const x = Object.freeze([0, 1]), y = Object.freeze([1, 2]), series = Object.freeze([Object.freeze({ y })]);
  const c = Object.freeze({ axes: profile, x, series, unit: 'ms', xUnit: 's' });
  const f = figure().line(c as any); assert.equal(f.render(), f.render());
  const mutable = { axes: profile, x: [0, 1], series: [{ y: [1, 2] }], unit: 'ms' };
  const live = figure().line(mutable); assert.doesNotThrow(() => live.render());
  mutable.x[0] = -1e308; mutable.x[1] = 1e308; assert.throws(() => live.render(), RangeError);
  mutable.x[0] = 0; mutable.x[1] = 1; assert.doesNotThrow(() => live.render());
  // Figure shallow-copies config, but retains each data array by the established native contract.
  assert.deepEqual(mutable.series, [{ y: [1, 2] }]);
});

test('closed machine provider-v1 continues to reject native-only profile and unit fields', () => {
  for (const c of bare) {
    for (const fields of [{ axes: profile }, { unit: 'ms' }, { xUnit: 's' }]) assert.throws(() => validateInput({ schema_version: 'plot-ts.svg-figure/v1', charts: [{ ...c, ...fields }] }), /unknown_field|unsupported_option/);
  }
  assert.throws(() => validateInput({ schema_version: 'plot-ts.svg-figure/v1', charts: [{ type: 'scatter', points: [], xAxis: true }] }), /unsupported_option/);
});

// New-profile snapshots supplement semantic and native-raster gates; legacy
// golden files are deliberately unchanged. These fixtures are synthetic.
test('numeric-profile synthetic snapshots remain byte stable', () => {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/svg-numeric-axes-golden.json', import.meta.url), 'utf8'));
  for (const row of golden.entries) {
    const fixture = numericAxesFixtures.find(([name]) => name === row.name)!;
    const svg = fixture[1](figure({ width: row.width, height: row.height, ...(row.theme === 'legacy' ? {} : { theme: row.theme }) })).render();
    assert.ok(Object.values(row.sha256).includes(createHash('sha256').update(svg).digest('hex')), `${row.theme}/${row.name}: unrecognized native runtime snapshot`);
  }
});
