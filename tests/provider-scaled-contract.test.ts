import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJson, ProviderError } from '../src/provider/json.js';
import { validateScaledInput, renderScaledInput } from '../src/provider/input-scaled.js';
import { makeScaledReceipt, validateScaledReceipt } from '../src/provider/receipt-scaled.js';
import { validateInput } from '../src/provider/input.js';
import { validateInputV2 } from '../src/provider/input-v2.js';
import { validateFrameInput } from '../src/provider/input-frame.js';
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES, type SvgFigureOptions } from '../src/svg/index.js';
import type { LineChart, ScatterChart } from '../src/svg/charts.js';
import receiptSchema from '../src/provider/scaled-render-receipt-v1.schema.json' with { type: 'json' };
import documentSchema from '../src/provider/svg-scaled-figure-v1.schema.json' with { type: 'json' };
const schema_version = 'plot-ts.svg-scaled-figure/v1';
const axes = 'scaled-axes-v1' as const;
const sourceSha = 'f15171054f6a55a7a0675599266589da9b6ddf9e1920548103a68deace3fd701';
const line = { type: 'line', axes, x: [1, 10, 100], series: [{ y: [1, null, 100] }] };
const scatter = { type: 'scatter', axes, points: [{ x: 1, y: 1, size: 0 }, { x: 100, y: 100, size: 12.25 }] };
const doc = (...charts: unknown[]) => ({ schema_version, figure: { width: 1400, height: 900, columns: 2 }, charts });
const parse = (d: unknown) => validateScaledInput(parseJson(Buffer.from(JSON.stringify(d)), 4 * 1024 * 1024, true));
function reject(fn: () => unknown, code?: string) {
  assert.throws(fn, (e: unknown) => { assert.ok(e instanceof ProviderError); if (code) assert.equal(e.code, code); assert.doesNotMatch(e.message, /\/tmp|\/workspace|RangeError/); return true; });
}
function native(d: { figure?: SvgFigureOptions; charts: unknown[] }) {
  const f = figure(d.figure);
  for (const raw of d.charts) { const c = raw as LineChart | ScatterChart; if (c.type === 'line') f.line(c); else f.scatter(c); }
  return f.render();
}
function parity(d: ReturnType<typeof doc>) {
  const before = JSON.stringify(d), expected = native(d), actual = renderScaledInput(parse(d));
  assert.equal(actual, expected); assert.equal(JSON.stringify(d), before);
  assert.doesNotMatch(actual, /NaN|Infinity|undefined|@keyframes|data-plot-motion/);
  return actual;
}

test('separate scaled schema negotiates exactly; old V1/V2/frame stay closed', () => {
  assert.equal(documentSchema.$id, 'urn:plot-ts:svg-scaled-figure:v1'); assert.equal(receiptSchema.$id, 'urn:plot-ts:scaled-render-receipt:v1');
  for (const s of ['plot-ts.svg-figure/v1', 'plot-ts.svg-figure/v2', 'plot-ts.svg-frame/v1', '', null, 'plot-ts.svg-scaled-figure/v2']) reject(() => parse({ ...doc(line), schema_version: s }), 'unsupported_schema');
  for (const [s, check] of [['plot-ts.svg-figure/v1', validateInput], ['plot-ts.svg-figure/v2', validateInputV2], ['plot-ts.svg-frame/v1', validateFrameInput]] as const) {
    reject(() => check({ ...doc(line), schema_version: s, ...(s.includes('frame') ? { frame: { profile: 'entry-v1', time_ms: 0, reduced_motion: false } } : {}) }));
  }
  for (const type of ['column', 'heatmap', 'bar', 'line-gaps', '__proto__']) reject(() => parse(doc({ type })), 'unsupported_chart');
  for (const base of [line, scatter]) {
    const { axes: _a, ...bare } = base;
    reject(() => parse(doc(bare)), 'missing_field');
    for (const a of ['numeric-axes-v1', 'scaled-axes-v2', null, false]) reject(() => parse(doc({ ...bare, axes: a })));
  }
});

test('all scale combinations, themes, surfaces and supplied exact domains match original native documents', () => {
  let count = 0;
  for (const xScale of ['linear', 'log10']) for (const yScale of ['linear', 'log10']) {
    for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
      const d = { ...doc({ ...line, xScale, yScale, xDomain: [0.1, 1000], yDomain: [0.01, 1000], unit: '  W / m²  ', xUnit: '秒 <&>', legend: 'series-names-v1', series: [{ name: '実測 <&>', y: [1, null, 100], area: false, smooth: false }], labels: false, yAxis: true }, { ...scatter, xScale, yScale, xAxis: true, yAxis: true, unit: '%', xUnit: 'Hz' }), figure: { width: 1400, height: 600, columns: 2, ...(theme ? { theme } : {}), surfacePolicy } };
      const svg = parity(d); assert.equal((svg.match(/data-plot-axes="scaled-axes-v1"/g) ?? []).length, 2); count++;
    }
  }
  assert.equal(count, 180);
  parity(doc(line, scatter)); // Omitted scale fields remain absent and native defaults linear.
});

test('empty, all-null, exact constants, reordered/repeated X and full positive binary64 range use native semantics', () => {
  for (const xScale of ['linear', 'log10']) for (const yScale of ['linear', 'log10']) {
    for (const charts of [
      [{ ...line, x: [], series: [{ y: [] }] }, { ...scatter, points: [] }],
      [{ ...line, x: [3, 1, 3, 2], series: [{ y: [null, null, null, null] }] }],
      [{ ...line, x: [2, 2], series: [{ y: [3, 3] }], xDomain: [2, 2], yDomain: [3, 3] }, { ...scatter, points: [{ x: 2, y: 3 }], xDomain: [2, 2], yDomain: [3, 3] }],
      [{ ...line, x: [3, 1, 1, 2], series: [{ y: [1, null, 2, 3] }, { y: [null, 2, 3, null] }] }],
    ]) parity(doc(...charts.map(c => ({ ...c, xScale, yScale }))));
  }
  for (const values of [[Number.MIN_VALUE, 2 * Number.MIN_VALUE, 1e-300], [Number.MIN_VALUE, 1, Number.MAX_VALUE], [1, 1 + Number.EPSILON, 1 + 2 * Number.EPSILON], [0.1, 1, 10]]) {
    parity(doc({ ...line, xScale: 'log10', yScale: 'log10', x: values, series: [{ y: values }] }, { ...scatter, xScale: 'log10', yScale: 'log10', points: values.map(v => ({ x: v, y: v, size: 0 })) }));
  }
  parity(doc({ ...line, x: [-2, -0, 2], series: [{ y: [-1, 0, 1] }], xDomain: [-3, 3], yDomain: [-2, 2] }));
});

test('unsupported fields/styles, unsafe text, malformed finite values and domain shapes reject closed', () => {
  for (const base of [line, scatter]) {
    for (const key of ['frame', 'animated', 'motion', 'html', 'max', 'palette', 'extra', 'smooth']) for (const v of [false, null, '', 1]) reject(() => parse(doc({ ...base, [key]: v })));
    for (const key of ['xScale', 'yScale']) for (const v of [null, false, 10, '', 'log', 'symlog']) reject(() => parse(doc({ ...base, [key]: v })));
    for (const key of ['xDomain', 'yDomain']) for (const v of [null, false, [], [1], [1, 2, 3], ['1', 2], [null, 2]]) reject(() => parse(doc({ ...base, [key]: v })));
    for (const key of ['unit', 'xUnit']) for (const v of ['', ' ', '\n', 'a\tb', '\ud800', '\u0000', 'x'.repeat(129), null]) reject(() => parse(doc({ ...base, [key]: v })));
    for (const v of [false, null, 0]) reject(() => parse(doc({ ...base, yAxis: v })));
  }
  for (const v of [true, null, 0]) reject(() => parse(doc({ ...line, labels: v })));
  for (const key of ['area', 'smooth']) for (const v of [true, null, 0]) reject(() => parse(doc({ ...line, series: [{ y: [1, null, 3], [key]: v }] })));
  for (const v of [true, false, null]) reject(() => parse(doc({ ...line, xAxis: v })));
  for (const key of ['legend', 'labels', 'series']) reject(() => parse(doc({ ...scatter, [key]: false })));
  for (const y of [[1], [1, 2, 3, 4], [1, '2', 3]]) reject(() => parse(doc({ ...line, series: [{ y }] })));
  for (const v of [NaN, Infinity, -Infinity]) {
    reject(() => validateScaledInput(doc({ ...line, x: [v, 1, 2] })), 'invalid_number');
    reject(() => validateScaledInput(doc({ ...line, yDomain: [1, v] })), 'invalid_number');
  }
  for (const key of ['accent', 'animated', 'axes', 'extra']) reject(() => parse({ ...doc(line), figure: { [key]: false } }));
  for (const size of [-1, 1025, null, '1']) reject(() => parse(doc({ ...scatter, points: [{ x: 1, y: 1, size }] })));
  for (const series of [[], Array(9).fill({ y: [1, 2, 3] }), [{ y: [1, 2, 3], name: 'unrequested' }]]) reject(() => parse(doc({ ...line, series })));
  for (const name of ['', ' ', 'a\nb', 'x'.repeat(129)]) reject(() => parse(doc({ ...line, legend: 'series-names-v1', series: [{ name, y: [1, 2, 3] }] })));
  reject(() => parse(doc({ ...line, legend: 'series-names-v1', series: [{ name: 'same', y: [1, 2, 3] }, { name: 'same', y: [2, 3, 4] }] })), 'duplicate_series_name');
});

test('native domain/positivity/overflow/fit rejection remains authoritative and sanitized', () => {
  const cases = [
    doc({ ...line, xScale: 'log10', x: [0, 1, 2] }), doc({ ...line, yScale: 'log10', series: [{ y: [1, null, -1] }] }),
    doc({ ...line, xScale: 'log10', x: [-0, 1, 2], series: [{ y: [null, 1, 2] }] }),
    doc({ ...scatter, yScale: 'log10', points: [{ x: 1, y: 0 }] }),
    ...[[3, 1], [2, 100], [1, 99], [2, 2]].map(xDomain => doc({ ...line, xDomain })),
    doc({ ...line, xScale: 'log10', xDomain: [0, 100] }), doc({ ...line, xDomain: [-Number.MAX_VALUE, Number.MAX_VALUE] }),
    doc({ ...line, x: [-Number.MAX_VALUE, 0, Number.MAX_VALUE] }),
    { ...doc(line), figure: { width: 50, height: 50, columns: 1 } },
    { ...doc({ ...line, unit: 'W'.repeat(128) }), figure: { width: 200, height: 300, columns: 1 } },
  ];
  for (const d of cases) { const validated = parse(d); assert.throws(() => native(d), RangeError); reject(() => renderScaledInput(validated), 'native_render_rejected'); }
});

test('raw/parser, panel, series and global scalar-slot budgets include nulls before render', () => {
  const raw = JSON.stringify(doc(line)); assert.ok(parseJson(Buffer.from(raw.padEnd(4194304, ' '))));
  reject(() => parseJson(Buffer.from(raw.padEnd(4194305, ' '))), 'byte_limit');
  for (const raw of ['{"schema_version":"a","schema_\\u0076ersion":"b"}', '{"xScale":"linear","\\u0078Scale":"log10"}', '1e400']) reject(() => parseJson(Buffer.from(raw)));
  reject(() => parseJson(Buffer.from('['.repeat(17) + '0' + ']'.repeat(17))), 'depth_limit');
  reject(() => parse(doc()), 'array_limit'); reject(() => parse(doc(...Array(17).fill(line))), 'array_limit');
  assert.equal(parse(doc(...Array(16).fill(line))).charts.length, 16);
  const single = { ...line, x: Array(16384).fill(1), series: [{ y: Array(16384).fill(null) }] };
  assert.equal(parse(doc(single, single)).charts.length, 2); // Exactly 65536 X + nullable Y slots.
  reject(() => parse(doc(single, single, { ...line, x: [1], series: [{ y: [null] }] })), 'data_limit');
  reject(() => parse(doc(single, { ...single, xDomain: [1, 1] })), 'data_limit');
  assert.equal(parse(doc({ ...line, x: Array(2048).fill(1), series: Array(8).fill({ y: Array(2048).fill(null) }) })).charts.length, 1);
  reject(() => parse(doc({ ...line, x: Array(2049).fill(1), series: Array(8).fill({ y: Array(2049).fill(null) }) })), 'chart_data_limit');
  reject(() => parse(doc({ ...single, x: Array(16385).fill(1), series: [{ y: Array(16385).fill(null) }] })), 'array_limit');
  const points = Array(16384).fill({ x: 1, y: 1 });
  reject(() => parse(doc({ ...scatter, points }, { ...scatter, points })), 'node_limit'); // Parser budget can bind first.
  assert.equal(validateScaledInput(doc({ ...scatter, points }, { ...scatter, points })).charts.length, 2);
  reject(() => validateScaledInput(doc({ ...scatter, points }, { ...scatter, points }, { ...scatter, points: [{ x: 1, y: 1 }] })), 'data_limit');
  reject(() => parse(doc({ ...scatter, points: [...points, points[0]] })), 'array_limit');
  // An invalid log panel before a late oversized panel still fails the document budget first.
  reject(() => parse(doc({ ...line, xScale: 'log10', x: [0, 1, 2] }, { ...scatter, points: [...points, points[0]] })), 'array_limit');
});

test('complete typed receipt binds ordered request metadata, raw input/SVG and exact native source without inferred claims', () => {
  const d = doc({ ...line, xScale: 'log10', unit: 'W', legend: 'series-names-v1', series: [{ name: 'one', y: [1, null, 100] }] }, { ...scatter, yScale: 'log10', xUnit: 's' });
  const input = parse(d), raw = Buffer.from(JSON.stringify(d)), svg = Buffer.from(renderScaledInput(input));
  const bytes = makeScaledReceipt(input, raw, svg, '1.0.0', sourceSha), r = JSON.parse(bytes.toString());
  validateScaledReceipt(r, input, raw, svg, '1.0.0', sourceSha);
  assert.deepEqual(r.figure.scaled_axes_panels, [
    { panel_index: 0, chart_type: 'line', profile: axes, axes: 'xy', x_scale: 'log10', y_scale: 'linear', unit_axes: ['y'] },
    { panel_index: 1, chart_type: 'scatter', profile: axes, axes: 'xy', x_scale: 'linear', y_scale: 'log10', unit_axes: ['x'] },
  ]);
  assert.equal(r.renderer_source.sha256, sourceSha); assert.equal(r.rendering.mode, 'static');
  assert.doesNotMatch(bytes.toString(), /"(?:xDomain|yDomain|ticks|font_metrics|path|source_root|timestamp)"/);
  for (const mutate of [
    (v: any) => { v.figure.scaled_axes_panels.reverse(); }, (v: any) => { v.figure.scaled_axes_panels.pop(); },
    (v: any) => { v.figure.scaled_axes_panels[0].x_scale = 'linear'; }, (v: any) => { v.figure.scaled_axes_panels[1].unit_axes = ['y']; },
    (v: any) => { v.figure.scaled_axes_panels[0].xDomain = [1, 100]; }, (v: any) => { v.figure.legend_panels = []; },
    (v: any) => { v.limitations.reverse(); }, (v: any) => { v.limitations.pop(); }, (v: any) => { v.renderer_source.sha256 = 'a'.repeat(64); },
    (v: any) => { v.artifact_receipt.primary.sha256 = '0'.repeat(64); }, (v: any) => { v.artifact_receipt.inputs[0].bytes++; },
    (v: any) => { v.figure.width++; }, (v: any) => { v.runtime.node = '22.0.0'; }, (v: any) => { v.extra = false; },
  ]) { const copy = structuredClone(r); mutate(copy); reject(() => validateScaledReceipt(copy, input, raw, svg, '1.0.0', sourceSha), 'receipt_invalid'); }
  for (const [a,b] of [[Buffer.concat([raw, Buffer.from(' ')]), svg], [raw, Buffer.concat([svg, Buffer.from(' ')])]]) reject(() => validateScaledReceipt(r, input, a!, b!, '1.0.0', sourceSha), 'receipt_invalid');
  reject(() => makeScaledReceipt(input, raw, svg, '1.0.0', 'bad'), 'receipt_invalid');
  const reversedKeys = Object.fromEntries(Object.entries(r).reverse()); validateScaledReceipt(reversedKeys, input, raw, svg, '1.0.0', sourceSha);
});
