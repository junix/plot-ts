import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseJson, ProviderError } from '../src/provider/json.js';
import { validateInput, renderInput, type SupportedChart } from '../src/provider/input.js';
import { validateInputV2, renderInputV2 } from '../src/provider/input-v2.js';
import { makeReceipt } from '../src/provider/receipt.js';
import { makeReceiptV2, validateReceiptV2 } from '../src/provider/receipt-v2.js';
import { schemaCheck } from '../src/provider/schema-check.js';
import { publishPair } from '../src/provider/io.js';
import receiptSchema from '../src/provider/render-receipt-v2.schema.json' with { type: 'json' };
import documentSchema from '../src/provider/svg-figure-v2.schema.json' with { type: 'json' };
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES, type SvgFigureOptions } from '../src/svg/index.js';
import { esc } from '../src/util/html.js';

const V1 = 'plot-ts.svg-figure/v1';
const V2 = 'plot-ts.svg-figure/v2';
const AXES = 'numeric-axes-v1' as const;
const VERSION = '1.0.0';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const parsed = (value: unknown) => validateInputV2(parseJson(Buffer.from(JSON.stringify(value))));
const reject = (fn: () => unknown, code?: string, field?: string) => assert.throws(fn, (error: unknown) => {
  assert.ok(error instanceof ProviderError, `expected ProviderError, got ${String(error)}`);
  if (code) assert.equal(error.code, code);
  if (field) assert.equal(error.field, field);
  assert.doesNotMatch(error.message, /\/workspace|\/tmp|RangeError|full ticks|inferred maximum/);
  return true;
});
const column = { type: 'column', axes: AXES, categories: ['A', 'B'], series: [{ values: [1, 2] }] };
const line = { type: 'line', axes: AXES, x: [0, 1], series: [{ y: [1, 2] }] };
const scatter = { type: 'scatter', axes: AXES, points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] };
const heatmap = { type: 'heatmap', data: [[-1, 2], [3, 0]], xLabels: ['A', 'B'], yLabels: ['実測', 'Plan'] };
const doc = (...charts: unknown[]) => ({ schema_version: V2, charts });
type SuppliedFigure = { figure?: SvgFigureOptions; charts: unknown[] };
/** Independent oracle: dispatch the original supplied JSON objects, never validator output. */
function native(source: SuppliedFigure): string {
  const f = figure(source.figure);
  for (const raw of source.charts) {
    const chart = raw as SupportedChart;
    switch (chart.type) {
      case 'column': f.bar(chart); break;
      case 'line': f.line(chart); break;
      case 'scatter': f.scatter(chart); break;
      case 'heatmap': f.heatmap(chart); break;
      default: assert.fail('unsupported oracle chart');
    }
  }
  return f.render();
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function parity(source: SuppliedFigure & { schema_version: string }): string {
  const before = JSON.stringify(source);
  const expected = native(source);
  const actual = renderInputV2(parsed(source));
  assert.equal(actual, expected);
  assert.equal(JSON.stringify(source), before);
  assert.doesNotMatch(actual, /NaN|Infinity|undefined|data-plot-motion|@keyframes/);
  return actual;
}

// Synthetic supplied JSON; no units, order, gaps, precision, radii or domain values
// are normalized before the independent native call.
const mixed = {
  schema_version: V2,
  figure: { width: 1216, height: 900, columns: 2, title: 'Supplied observations & <forecast>', gap: 16 },
  charts: [
    { type: 'column', axes: AXES, unit: '  accounts  / day  ', categories: ['North', 'South'], stacked: true, labels: false, legend: 'series-names-v1', series: [{ name: 'Gains', values: [12, 8] }, { name: 'Losses', values: [-5, -11] }, { name: 'Other', values: [8, null] }] },
    { ...heatmap, colormap: 'plasma' },
    { type: 'line', axes: AXES, unit: '電圧（mV）', xUnit: '時間（秒）', x: [0.3, 0, 0.2, 0.1], legend: 'series-names-v1', series: [{ name: '実測 & <A>', y: [1.6, 1.2, null, 2.1], area: true }, { name: '予測', y: [1.7, 1.1, 1.5, 1.8] }] },
    { type: 'scatter', axes: AXES, unit: 'mol/L & <sample>', xUnit: 's', points: [{ x: 0.03, y: 0.00015, size: 30.01 }, { x: 0.01, y: 0.00012, size: 0 }, { x: 0.02, y: 0.00019 }] },
  ],
};

test('V2 negotiates exactly and never infers axes, upgrades V1 or falls back', () => {
  assert.equal(documentSchema.$id, 'urn:plot-ts:svg-figure:v2');
  assert.equal(receiptSchema.$id, 'urn:plot-ts:render-receipt:v2');
  assert.equal(parsed(doc(line)).schema_version, V2);
  for (const schema_version of [V1, 'v2', 'plot-ts.svg-figure/v3', '', null, false]) reject(() => parsed({ ...doc(line), schema_version }), 'unsupported_schema');
  reject(() => validateInput({ ...doc(line), schema_version: V2 }), 'unsupported_schema');
  for (const chart of [column, line, scatter]) {
    const { axes: _axes, ...bare } = chart;
    for (const supplied of [bare, { ...bare, unit: 'm' }]) reject(() => parsed(doc(supplied)), 'missing_field', '$.charts[0].axes');
    for (const axes of [null, false, true, 1, {}, [], '', 'numeric-axes', 'numeric-axes-v2']) reject(() => parsed(doc({ ...bare, axes })));
    for (const fields of [{ axes: AXES }, { unit: 'm' }, { xUnit: 's' }]) reject(() => validateInput({ schema_version: V1, charts: [{ ...bare, ...fields }] }));
  }
  for (const value of [null, [], {}, { schema_version: V2 }, { charts: [line] }, { ...doc(line), unknown: false }, { ...doc(line), axes: AXES }]) reject(() => parsed(value));
  for (const type of ['bar', 'donut', 'gauge', 'radar', 'waterfall', 'slope', 'pyramid', '__proto__']) reject(() => parsed(doc({ type })), 'unsupported_chart');
});

test('V2 closed objects reject ineffective fields even when false, null or empty', () => {
  for (const chart of [column, line, scatter]) {
    for (const key of ['smooth', 'animated', 'motion', 'frame', 'html', 'palette', 'options', 'extra']) {
      for (const value of [false, null, '']) reject(() => parsed(doc({ ...chart, [key]: value })));
    }
    for (const yAxis of [false, null, 0, 'true', {}]) reject(() => parsed(doc({ ...chart, yAxis })));
    assert.deepEqual(parsed(doc({ ...chart, yAxis: true })).charts[0], { ...chart, yAxis: true });
  }
  for (const chart of [column, line]) for (const xAxis of [true, false, null]) reject(() => parsed(doc({ ...chart, xAxis })));
  for (const xAxis of [false, null, 0, 'true']) reject(() => parsed(doc({ ...scatter, xAxis })));
  assert.equal(renderInputV2(parsed(doc({ ...scatter, xAxis: true, yAxis: true }))), renderInputV2(parsed(doc(scatter))));
  for (const xUnit of ['s', '', null, false]) reject(() => parsed(doc({ ...column, xUnit })));
  for (const labels of [true, false, null, '']) reject(() => parsed(doc({ ...line, labels })));
  for (const chart of [column, line]) {
    const key = chart.type === 'column' ? 'values' : 'y';
    for (const extra of [{ smooth: false }, { labels: false }, { unit: '' }, { name: 'ignored' }, { extra: null }]) reject(() => parsed(doc({ ...chart, series: [{ [key]: [1, 2], ...extra }] })));
  }
  for (const extra of [{ name: 'ignored' }, { unit: '' }, { extra: null }]) reject(() => parsed(doc({ ...scatter, points: [{ x: 0, y: 1, ...extra }] })));
  for (const key of ['accent', 'animated', 'axes', 'unit', 'xUnit', 'motion', 'extra']) reject(() => parsed({ ...doc(line), figure: { [key]: false } }));
  for (const figure of [null, [], { width: null }, { title: null }, { theme: 'legacy' }, { theme: 'Sage' }, { surfacePolicy: 'transparent' }]) reject(() => parsed({ ...doc(line), figure }));
  for (const [key, values] of [['width', [0, -1, 8193]], ['height', [0, -1, 8193]], ['columns', [0, 1.5, 17]], ['gap', [-1, 1025]]] as const) {
    for (const value of values) reject(() => parsed({ ...doc(line), figure: { [key]: value } }));
  }
  for (const precision of [-1, 0.5, 13, null]) reject(() => parsed(doc({ ...column, precision })));
  for (const size of [-1, 1025, null, '4']) reject(() => parsed(doc({ ...scatter, points: [{ x: 0, y: 1, size }] })));
});

test('units are exact scalar/byte-bounded literal single-line text with field diagnostics', () => {
  const valid = ['%', '°C', 'µg/m³', 'kg·m²/s²', '件/日', 'e\u0301', '  a  b  ', '<&>"\'', 'x'.repeat(128), '😀'.repeat(128)];
  for (const unit of valid) {
    const source = { ...doc({ ...line, unit, xUnit: unit }), figure: { width: 2048, height: 500 } };
    const input = parsed(source);
    assert.equal((input.charts[0] as { unit?: string }).unit, unit);
    assert.equal((input.charts[0] as { xUnit?: string }).xUnit, unit);
    const svg = parity(source);
    assert.equal((svg.match(/data-plot-unit=/g) ?? []).length, 2);
    assert.ok(svg.includes(`>${esc(unit)}</text>`));
    assert.match(svg, /xml:space="preserve"/);
  }
  for (const key of ['unit', 'xUnit']) for (const unit of [null, false, true, 1, [], {}, '', ' ', '\u00a0', 'a\tb', 'a\nb', 'a\rb', 'a\u2028b', 'a\u2029b', '\ud800', '\udfff', '\u0000', '\u000b', '\ufffe', '\uffff', 'x'.repeat(129), '😀'.repeat(129)]) {
    // Direct validation and the V2 parser both preserve unit-field attribution.
    reject(() => validateInputV2(doc({ ...line, [key]: unit })), undefined, `$.charts[0].${key}`);
  }
  assert.notEqual(parity(doc({ ...line, unit: 'é' })), parity(doc({ ...line, unit: 'e\u0301' })));
});

test('V2 parser attributes unsafe unit text without changing V1 or echoing arbitrary fields', () => {
  for (const key of ['unit', 'xUnit']) for (const unit of ['\ud800', '\udfff', '\u0000', '\u000b', '\ufffe', '\uffff', 'x'.repeat(1025)]) {
    const raw = Buffer.from(JSON.stringify(doc({ ...line, [key]: unit })));
    reject(() => parseJson(raw, 4 * 1024 * 1024, true), undefined, `$.charts[0].${key}`);
    reject(() => parseJson(raw), undefined, '$');
  }
  for (const source of [{ '/private/input-name': '\ud800' }, { nested: { charts: [{ unit: '\ud800' }] } }, { charts: [{ '/private/unit': '\ud800' }] }]) {
    reject(() => parseJson(Buffer.from(JSON.stringify(source)), 4 * 1024 * 1024, true), undefined, '$');
  }
});

test('heatmap remains the V1 categorical contract, including empty and prefix labels', () => {
  for (const key of ['axes', 'unit', 'xUnit', 'xAxis', 'yAxis']) for (const value of [AXES, false, null, '']) reject(() => parsed(doc({ ...heatmap, [key]: value })));
  for (const chart of [
    { type: 'heatmap', data: [] }, { type: 'heatmap', data: [], xLabels: [], yLabels: [] },
    { ...heatmap, xLabels: [], yLabels: [] }, { ...heatmap, xLabels: ['Only first'], yLabels: ['Only first'] },
    ...['viridis', 'plasma', 'blues'].map(colormap => ({ ...heatmap, colormap })),
  ]) {
    const source = doc(chart), svg = parity(source);
    assert.equal(svg, renderInput(validateInput({ ...source, schema_version: V1 })));
    assert.doesNotMatch(svg, /data-plot-axes|data-plot-unit/);
  }
  for (const chart of [{ ...heatmap, data: [[]] }, { ...heatmap, data: [[1], [1, 2]] }, { ...heatmap, xLabels: ['a', 'b', 'c'] }, { ...heatmap, yLabels: ['a', 'b', 'c'] }, { type: 'heatmap', data: [], xLabels: ['surplus'] }, { ...heatmap, colormap: 'inferno' }, { ...heatmap, xLabels: null }]) reject(() => parsed(doc(chart)));
});

test('series names, aligned gaps and explicit optional values remain strict', () => {
  for (const base of [column, line]) {
    const key = base.type === 'column' ? 'values' : 'y';
    for (const series of [[], Array(9).fill({ [key]: [1, 2] }), [{ [key]: [1] }], [{ [key]: [1, 2, 3] }], [{ [key]: [1, '2'] }]]) reject(() => parsed(doc({ ...base, series })));
    for (const name of ['', ' ', 'a\nb', 'a\tb', 'a\u2028b', 'x'.repeat(129), null]) reject(() => parsed(doc({ ...base, legend: 'series-names-v1', series: [{ name, [key]: [1, 2] }] })));
    reject(() => parsed(doc({ ...base, legend: 'series-names-v1' })));
    for (const legend of [null, false, '', 'series-names-v2']) reject(() => parsed(doc({ ...base, legend })));
    // Duplicate names are native-ineligible even if the structural validator accepted them.
    reject(() => renderInputV2(parsed(doc({ ...base, legend: 'series-names-v1', series: [{ name: 'Same', [key]: [1, 2] }, { name: 'Same', [key]: [2, 1] }] }))));
  }
  const input = parsed(doc({ ...line, x: [3, 0, 2, 1], series: [{ y: [1, null, 2, null] }, { y: [null, 3, 4, 0], area: false }] }, { ...column, series: [{ values: [1.2, null] }] }, scatter));
  assert.deepEqual(input.charts, [
    { ...line, x: [3, 0, 2, 1], series: [{ y: [1, null, 2, null] }, { y: [null, 3, 4, 0], area: false }] },
    { ...column, series: [{ values: [1.2, null] }] }, scatter,
  ]);
  assert.equal(Object.hasOwn(input.charts[1]!, 'precision'), false);
  assert.equal(Object.hasOwn(input.charts[1]!, 'labels'), false);
  assert.equal(Object.hasOwn(input.charts[1]!, 'stacked'), false);
  assert.equal(Object.hasOwn((input.charts[2] as typeof scatter).points[0]!, 'size'), false);
  const omitted = parity(doc({ ...column, series: [{ values: [1.2, 2] }], labels: true }));
  const explicit = parity(doc({ ...column, series: [{ values: [1.2, 2] }], labels: true, precision: 2 }));
  assert.notEqual(omitted, explicit); assert.match(explicit, />1\.20<\/text>/);
});

test('original supplied JSON matches native bytes for legacy plus 14 themes and all 3 surfaces', () => {
  let count = 0;
  const empty = doc({ ...column, categories: [], series: [{ values: [] }] }, { ...line, x: [], series: [{ y: [] }] }, { ...scatter, points: [] }, { type: 'heatmap', data: [] });
  const extremes = doc(
    { ...column, categories: ['inferred tiny'], labels: false, series: [{ values: [Number.MIN_VALUE] }], unit: '%' },
    { ...column, categories: ['tiny'], labels: false, max: Number.MIN_VALUE, series: [{ values: [Number.MIN_VALUE] }], unit: '%' },
    { ...line, x: [2 * Number.MIN_VALUE, Number.MIN_VALUE], series: [{ y: [1, 2] }] },
    { ...scatter, points: [{ x: Number.MAX_VALUE, y: 1, size: 0 }], unit: 'value', xUnit: 'raw x' },
    { ...scatter, points: [{ x: -1, y: -1, size: 30.01 }, { x: 1, y: 1, size: 30.01 }], unit: 'radius is px' },
  );
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
    for (const source of [mixed, { ...empty, figure: mixed.figure }, { ...extremes, figure: mixed.figure }]) {
      const supplied = freeze({ ...structuredClone(source), figure: { ...source.figure, ...(theme ? { theme } : {}), surfacePolicy } });
      const svg = parity(supplied);
      assert.equal((svg.match(/data-plot-axes=/g) ?? []).length, source === mixed ? 3 : source.charts.filter(c => c.type !== 'heatmap').length);
      count++;
    }
  }
  assert.equal(count, 135);
  parity(doc({ ...line, x: [0, 1, 99], series: [{ y: [1, null, null], area: true }] }));
  const percent = parity(doc({ ...column, unit: '%', format: 'percent', precision: 2, series: [{ values: [0.25, 0.5] }] }));
  assert.match(percent, /data-domain-max="0\.5"/);
  assert.match(percent, /data-plot-tick-value="0\.5"/);
  assert.match(percent, />0\.50%<\/text>/);
  const radii = parity(doc({ ...scatter, points: [{ x: 0, y: 0, size: 0 }, { x: 1, y: 1, size: 30.01 }] }));
  assert.match(radii, /r="30\.01"/);
});

test('finite source data can still be native-ineligible, with bounded whole-render failure', () => {
  const cases = [
    doc({ ...column, max: 1, series: [{ values: [2, 20] }] }), doc({ ...line, max: 1, series: [{ y: [2, 20] }] }),
    doc({ ...column, max: -1 }), doc({ ...line, max: -1 }),
    doc({ ...column, categories: ['A'], series: [{ values: [Number.MAX_VALUE] }] }),
    doc({ ...column, categories: ['A'], stacked: true, max: 1, series: [{ values: [1e308] }, { values: [1e308] }] }),
    doc({ ...column, categories: ['A'], stacked: true, max: 1, series: [{ values: [-1e308] }, { values: [-1e308] }] }),
    doc({ ...line, x: [-1e308, 1e308] }), doc({ ...line, x: [-Number.MIN_VALUE, 1] }),
    doc({ ...scatter, points: [{ x: -1e308, y: 1 }, { x: 1e308, y: 2 }] }),
    { ...doc({ ...line, unit: 'W'.repeat(128) }), figure: { width: 160, height: 250 } },
    { ...doc({ ...scatter, points: [{ x: 0, y: 0, size: 50 }] }), figure: { width: 160, height: 120 } },
    { ...doc(line), figure: { width: 64, height: 48 } },
    { ...doc({ ...line, legend: 'series-names-v1', series: Array.from({ length: 8 }, (_, i) => ({ name: `Series ${i} long name`, y: [1, 2] })) }), figure: { width: 160, height: 120 } },
    { ...mixed, figure: { width: 336, height: 240, columns: 2, title: 'Reduced body' } },
  ];
  for (const source of cases) {
    const input = parsed(source); // Domain/geometry rejection belongs to native, not this validator.
    assert.throws(() => native(source), RangeError);
    reject(() => renderInputV2(input), 'native_render_rejected', '$');
  }
  for (const max of [NaN, Infinity, -Infinity]) reject(() => validateInputV2(doc({ ...line, max })), 'invalid_number');
  for (const point of [{ x: NaN, y: 1 }, { x: 0, y: Infinity }]) reject(() => validateInputV2(doc({ ...scatter, points: [point] })), 'invalid_number');
});

test('singleton decimal-bound witness inherits the repaired native domain without provider repair', () => {
  const source = doc({ ...scatter, points: [{ x: 0, y: 0.00003 }] });
  const expected = native(source);
  assert.match(expected, /data-plot-axis="y" data-domain-min="0.00003" data-domain-max="0.00003"/);
  assert.equal(renderInputV2(parsed(source)), expected);
});

test('raw JSON, per-panel, total scalar and option boundaries remain bounded', () => {
  const raw = JSON.stringify(doc(line));
  assert.equal(parsed(doc(...Array(16).fill(line))).charts.length, 16);
  reject(() => parsed(doc(...Array(17).fill(line))), 'array_limit'); reject(() => parsed(doc()), 'array_limit');
  assert.equal(validateInputV2(parseJson(Buffer.from(raw.padEnd(4 * 1024 * 1024, ' ')))).charts.length, 1);
  reject(() => parseJson(Buffer.from(raw.padEnd(4 * 1024 * 1024 + 1, ' '))), 'byte_limit');
  for (const raw of ['{"schema_version":"plot-ts.svg-figure/v2","schema_\\u0076ersion":"plot-ts.svg-figure/v2","charts":[]}', '{"axes":"numeric-axes-v1","\\u0061xes":"numeric-axes-v1"}', '1e400', '"\\ud800"']) reject(() => parseJson(Buffer.from(raw)));
  assert.ok(Array.isArray(parseJson(Buffer.from('['.repeat(16) + '0' + ']'.repeat(16)))));
  reject(() => parseJson(Buffer.from('['.repeat(17) + '0' + ']'.repeat(17))), 'depth_limit');
  assert.equal((parseJson(Buffer.from(JSON.stringify(Array(16384).fill(0)))) as unknown[]).length, 16384);
  reject(() => parseJson(Buffer.from(JSON.stringify(Array(16385).fill(0)))), 'array_limit');
  const syntaxAtLimit = [...Array.from({ length: 7 }, () => Array(16384).fill(0)), Array(16375).fill(0)];
  assert.doesNotThrow(() => parseJson(Buffer.from(JSON.stringify(syntaxAtLimit))));
  syntaxAtLimit[7]!.push(0); reject(() => parseJson(Buffer.from(JSON.stringify(syntaxAtLimit))), 'node_limit');
  const positions = (length: number) => ({ ...column, categories: Array(length).fill('A'), series: [{ values: Array(length).fill(null) }, { values: Array(length).fill(null) }] });
  assert.equal(parsed(doc(positions(8192))).charts.length, 1);
  reject(() => parsed(doc(positions(8193))), 'chart_data_limit');
  const field = { type: 'heatmap', data: Array.from({ length: 128 }, () => Array(128).fill(1)) };
  assert.equal(parsed(doc(...Array(4).fill(field))).charts.length, 4);
  reject(() => parsed(doc(...Array(4).fill(field), { ...scatter, points: [{ x: 0, y: 0 }] })), 'data_limit');
  reject(() => parsed(doc({ type: 'heatmap', data: Array.from({ length: 129 }, () => Array(128).fill(1)) })), 'chart_data_limit');
  for (const data of [[Array(1025).fill(0)], Array.from({ length: 1025 }, () => [0])]) reject(() => parsed(doc({ type: 'heatmap', data })), 'array_limit');
  assert.doesNotThrow(() => parsed(doc({ type: 'heatmap', data: [Array(1024).fill(0)] }, { type: 'heatmap', data: Array.from({ length: 1024 }, () => [0]) })));
  const largeScatter = { ...scatter, points: Array.from({ length: 16384 }, () => ({ x: 0, y: 0, size: 0 })) };
  const countedX = { ...line, x: Array(8192).fill(0), series: [{ y: Array(8192).fill(0) }] };
  // Direct validation isolates numeric counts from the independent syntax-node cap.
  assert.doesNotThrow(() => validateInputV2(doc(largeScatter, countedX)));
  reject(() => validateInputV2(doc(largeScatter, countedX, { ...scatter, points: [{ x: 0, y: 0 }] })), 'data_limit');
  for (const figure of [{ width: 8192, height: 8192, columns: 16, gap: 1024 }, { width: Number.MIN_VALUE, height: Number.MIN_VALUE, columns: 1, gap: 0 }]) assert.doesNotThrow(() => parsed({ ...doc(line), figure }));
  for (const precision of [0, 12]) assert.doesNotThrow(() => parsed(doc({ ...column, precision })));
  assert.doesNotThrow(() => parsed(doc({ ...scatter, points: [{ x: 0, y: 0, size: 1024 }] })));
  // These checks must happen before consulting even a nonexistent source/destination.
  const unused = {} as Parameters<typeof publishPair>[0];
  reject(() => publishPair(unused, '/nonexistent/figure.svg', '/nonexistent/receipt.json', Buffer.alloc(8 * 1024 * 1024 + 1), Buffer.from('{}')), 'artifact_limit');
  reject(() => publishPair(unused, '/nonexistent/figure.svg', '/nonexistent/receipt.json', Buffer.from('<svg/>'), Buffer.alloc(256 * 1024 + 1)), 'artifact_limit');
});

function receiptFor(source: ReturnType<typeof doc> & { figure?: SvgFigureOptions }) {
  const raw = Buffer.from(JSON.stringify(source) + '\n');
  const input = parsed(source), svg = Buffer.from(renderInputV2(input));
  const bytes = makeReceiptV2(input, raw, svg, VERSION);
  const receipt = JSON.parse(bytes.toString());
  schemaCheck(receipt, receiptSchema);
  validateReceiptV2(receipt, input, raw, svg, VERSION);
  return { raw, input, svg, bytes, receipt };
}
const quantitativeLosses = ['system-fonts-unmeasured', 'numeric-axes-fit-approximate', 'numeric-axes-interior-ticks-fit-dependent', 'binary64-and-svg-coordinate-rounding'];
function expectedLosses(charts: unknown[]) {
  return charts.flatMap((raw, panel_index) => {
    const chart = raw as SupportedChart;
    const codes = chart.type === 'heatmap' ? ['system-fonts-unmeasured', 'heatmap-label-fit-approximate-with-full-title'] : [...quantitativeLosses];
    if ((chart.type === 'column' || chart.type === 'line') && !chart.legend) codes.push('order-color-series-without-legend');
    if (chart.type === 'column') {
      codes.push('column-category-label-fit-unmeasured');
      if (chart.labels !== false) codes.push('column-value-labels-rounded-and-height-conditional');
    }
    return codes.map(code => ({ panel_index, chart_type: chart.type, code }));
  });
}

test('V2 receipt honestly binds ordered quantitative/unit presence and exact limitations', () => {
  const { raw, svg, bytes, receipt } = receiptFor(mixed);
  assert.equal(receipt.schema_version, 'plot-ts.render-receipt/v2');
  assert.equal(receipt.profile, 'plot-ts-svg-static-numeric-axes/1');
  assert.equal(receipt.input_schema, V2);
  assert.deepEqual(receipt.figure.numeric_axes_panels, [
    { panel_index: 0, chart_type: 'column', profile: AXES, axes: 'y', unit_axes: ['y'] },
    { panel_index: 2, chart_type: 'line', profile: AXES, axes: 'xy', unit_axes: ['y', 'x'] },
    { panel_index: 3, chart_type: 'scatter', profile: AXES, axes: 'xy', unit_axes: ['y', 'x'] },
  ]);
  assert.deepEqual(receipt.figure.legend_panels, [{ panel_index: 0, profile: 'series-names-v1' }, { panel_index: 2, profile: 'series-names-v1' }]);
  assert.deepEqual(receipt.limitations, expectedLosses(mixed.charts));
  assert.deepEqual(receipt.artifact_receipt.inputs, [{ role: 'input', sha256: hash(raw), bytes: raw.length }]);
  assert.deepEqual(receipt.artifact_receipt.primary, { artifact_id: 'figure', role: 'primary', argument: 'output', kind: 'svg', sha256: hash(svg), bytes: svg.length });
  assert.equal(receipt.rendering.mode, 'static');
  assert.equal(receipt.theme.mode, 'legacy'); assert.equal(receipt.surface.policy, 'themed-v1');
  assert.doesNotMatch(bytes.toString(), /numeric-axis-labels-unavailable|Supplied observations|accounts|mol\/L|電圧|実測|\/workspace|\/tmp|timestamp|tick_count|domain_min/);
  assert.ok(bytes.length <= 256 * 1024);
  const empty = receiptFor(doc({ type: 'heatmap', data: [] })).receipt;
  assert.deepEqual(empty.figure.numeric_axes_panels, []);
  assert.deepEqual(empty.figure.legend_panels, []);
  assert.deepEqual(empty.limitations, expectedLosses([{ type: 'heatmap', data: [] }]));
  assert.deepEqual({ width: empty.figure.width, height: empty.figure.height, columns: empty.figure.columns, gap: empty.figure.gap }, { width: 800, height: 500, columns: 1, gap: 16 });
  for (const fields of [{}, { unit: 'm' }, { xUnit: 's' }, { unit: 'm', xUnit: 's' }]) {
    const result = receiptFor(doc({ ...line, ...fields })).receipt;
    assert.deepEqual(result.figure.numeric_axes_panels[0].unit_axes, [...(Object.hasOwn(fields, 'unit') ? ['y'] : []), ...(Object.hasOwn(fields, 'xUnit') ? ['x'] : [])]);
  }
  const sixteen = doc(...Array(16).fill(column));
  const full = receiptFor({ ...sixteen, figure: { width: 2400, height: 1600, columns: 4 } }).receipt;
  assert.equal(full.figure.numeric_axes_panels.length, 16);
  assert.equal(full.limitations.length, 112);
  assert.deepEqual(full.limitations, expectedLosses(sixteen.charts));
  for (const labels of [true, false]) assert.deepEqual(receiptFor(doc({ ...column, labels })).receipt.limitations, expectedLosses([{ ...column, labels }]));
});

test('receipt self-check rejects structural, coverage, order, unit, limitation and core tampering', () => {
  const { receipt, input, raw, svg } = receiptFor(mixed);
  const tamper = (change: (value: any) => void) => {
    const value = structuredClone(receipt); change(value);
    reject(() => validateReceiptV2(value, input, raw, svg, VERSION), 'receipt_invalid');
  };
  const changes: Array<(value: any) => void> = [
    r => { r.extra = false; }, r => { r.figure.extra = false; }, r => { delete r.figure.numeric_axes_panels; },
    r => { r.schema_version = 'plot-ts.render-receipt/v1'; }, r => { r.input_schema = V1; }, r => { r.profile = 'plot-ts-svg-static/1'; },
    r => { r.provider.id = 'other'; }, r => { r.provider.version = 'different'; },
    r => { r.figure.chart_types[0] = 'line'; }, r => { r.figure.chart_types.pop(); },
    r => { r.figure.width++; }, r => { r.figure.height++; }, r => { r.figure.columns++; }, r => { r.figure.gap++; },
    r => { r.figure.numeric_axes_panels.pop(); }, r => { r.figure.numeric_axes_panels = []; },
    r => { r.figure.numeric_axes_panels.reverse(); }, r => { r.figure.numeric_axes_panels.push(r.figure.numeric_axes_panels[0]); },
    r => { r.figure.numeric_axes_panels[0].panel_index = 1; }, r => { r.figure.numeric_axes_panels[0].panel_index = 16; },
    r => { r.figure.numeric_axes_panels[0].panel_index = 0.5; }, r => { r.figure.numeric_axes_panels[0].chart_type = 'heatmap'; },
    r => { r.figure.numeric_axes_panels[0].chart_type = 'line'; }, r => { r.figure.numeric_axes_panels[0].axes = 'xy'; },
    r => { r.figure.numeric_axes_panels[1].axes = 'y'; }, r => { r.figure.numeric_axes_panels[0].profile = 'numeric-axes-v2'; },
    r => { r.figure.numeric_axes_panels[0].extra = 'x'; }, r => { delete r.figure.numeric_axes_panels[0].unit_axes; },
    r => { r.figure.numeric_axes_panels[0].unit_axes = ['x']; }, r => { r.figure.numeric_axes_panels[0].unit_axes = []; },
    r => { r.figure.numeric_axes_panels[1].unit_axes = ['x', 'y']; }, r => { r.figure.numeric_axes_panels[1].unit_axes = ['y', 'y']; },
    r => { r.figure.numeric_axes_panels[1].unit_axes = ['y', 'x', 'y']; }, r => { r.figure.numeric_axes_panels[1].unit_axes = null; },
    r => { r.figure.legend_panels.pop(); }, r => { r.figure.legend_panels.reverse(); },
    r => { r.figure.legend_panels[0].panel_index = 1; }, r => { r.figure.legend_panels.push(r.figure.legend_panels[0]); },
    r => { r.limitations.pop(); }, r => { r.limitations.reverse(); }, r => { r.limitations.push(r.limitations[0]); },
    r => { r.limitations[0].panel_index = 1; }, r => { r.limitations[0].chart_type = 'scatter'; },
    r => { r.limitations[0].code = 'numeric-axis-labels-unavailable'; }, r => { r.limitations[0].code = 'numeric-axes-fit-approximate'; },
    r => { r.limitations[0].actual_thinned = false; }, r => { r.limitations = Array(113).fill(r.limitations[0]); },
    r => { r.artifact_receipt.extra = 1; }, r => { r.artifact_receipt.schema_version = 'plot.artifact-receipt-core/v2'; },
    r => { r.artifact_receipt.inputs[0].sha256 = '0'.repeat(64); }, r => { r.artifact_receipt.inputs[0].bytes++; },
    r => { r.artifact_receipt.inputs[0].role = 'other'; }, r => { r.artifact_receipt.inputs.push(r.artifact_receipt.inputs[0]); },
    r => { r.artifact_receipt.primary.sha256 = '0'.repeat(64); }, r => { r.artifact_receipt.primary.bytes++; },
    r => { r.artifact_receipt.primary.artifact_id = 'other'; }, r => { r.artifact_receipt.primary.role = 'other'; },
    r => { r.artifact_receipt.primary.argument = 'receipt'; }, r => { r.artifact_receipt.primary.kind = 'html'; },
    r => { r.surface.policy = 'transparent-root-v1'; }, r => { r.rendering.mode = 'animated'; },
    r => { r.theme = { mode: 'canonical', name: 'sage', registry_sha256: '0'.repeat(64) }; },
  ];
  for (const change of changes) tamper(change);
  reject(() => validateReceiptV2(receipt, input, Buffer.concat([raw, Buffer.from(' ')]), svg, VERSION), 'receipt_invalid');
  reject(() => validateReceiptV2(receipt, input, raw, Buffer.concat([svg, Buffer.from(' ')]), VERSION), 'receipt_invalid');
  const heat = receiptFor(doc(heatmap));
  const invented = structuredClone(heat.receipt);
  invented.figure.numeric_axes_panels = [{ panel_index: 0, chart_type: 'line', profile: AXES, axes: 'xy', unit_axes: [] }];
  reject(() => validateReceiptV2(invented, heat.input, heat.raw, heat.svg, VERSION), 'receipt_invalid');
  const noUnits = receiptFor(doc(line));
  noUnits.receipt.figure.numeric_axes_panels[0].unit_axes = ['y'];
  reject(() => validateReceiptV2(noUnits.receipt, noUnits.input, noUnits.raw, noUnits.svg, VERSION), 'receipt_invalid');
});

test('V1 schema bytes, omitted-profile SVG goldens and receipt semantics stay frozen', () => {
  for (const [name, expected] of [
    ['svg-figure-v1.schema.json', '4e83275004ee0581bf183e03463a19a419a3297f123d593c3f020a0b210957e8'],
    ['render-receipt-v1.schema.json', '78ef5e3fa7ca1beb3a9c60e0255a8717b29f8b8e173081637a5dda74a8762b34'],
  ]) assert.equal(hash(readFileSync(new URL(`../src/provider/${name}`, import.meta.url))), expected);
  const golden = JSON.parse(readFileSync(new URL('./fixtures/svg-panel-golden.json', import.meta.url), 'utf8'));
  const cases = [
    ['column-axis-true-labels-false', { type: 'column', categories: ['A', 'B'], series: [{ values: [2, 4] }], yAxis: true, labels: false }],
    ['line-axis-true', { type: 'line', x: [0, 1], series: [{ y: [2, 4], area: true }], yAxis: true }],
    ['scatter-axis-true', { type: 'scatter', points: [{ x: 0, y: 2 }, { x: 1, y: 4 }], yAxis: true }],
    ['heatmap-unlabeled', { type: 'heatmap', data: [[1, 2], [3, 4]] }],
  ] as const;
  for (const [name, chart] of cases) {
    const source = { schema_version: V1, charts: [chart] };
    const input = validateInput(parseJson(Buffer.from(JSON.stringify(source))));
    const svg = renderInput(input);
    assert.equal(svg, native(source));
    assert.equal(hash(svg), golden[`${name}/false/800/500/figure/`]);
    assert.doesNotMatch(svg, /data-plot-axes|data-plot-unit/);
    const raw = Buffer.from(JSON.stringify(source)), receipt = JSON.parse(makeReceipt(input, raw, Buffer.from(svg), VERSION).toString());
    assert.equal(receipt.schema_version, 'plot-ts.render-receipt/v1');
    assert.equal(receipt.profile, 'plot-ts-svg-static/1');
    assert.equal(Object.hasOwn(receipt.figure, 'numeric_axes_panels'), false);
    assert.deepEqual(receipt.limitations.map((r: { code: string }) => r.code), chart.type === 'heatmap' ? ['system-fonts-unmeasured', 'heatmap-label-fit-approximate-with-full-title'] : chart.type === 'scatter' ? ['system-fonts-unmeasured', 'numeric-axis-labels-unavailable'] : ['system-fonts-unmeasured', 'order-color-series-without-legend', 'numeric-axis-labels-unavailable']);
  }
  for (const chart of [column, line, scatter]) {
    const { axes: _axes, ...bare } = chart;
    for (const fields of [{ axes: AXES }, { unit: '' }, { xUnit: '' }, { smooth: false }]) reject(() => validateInput({ schema_version: V1, charts: [{ ...bare, ...fields }] }));
  }
  reject(() => validateInput({ schema_version: V1, charts: [{ type: 'scatter', points: [], xAxis: true }] }));
  reject(() => validateInput({ schema_version: V1, figure: { animated: false }, charts: [{ type: 'scatter', points: [] }] }));
});
