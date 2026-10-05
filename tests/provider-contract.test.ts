import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson, ProviderError } from '../src/provider/json.js';
import { validateInput, renderInput } from '../src/provider/input.js';
import { makeReceipt } from '../src/provider/receipt.js';
import { schemaCheck } from '../src/provider/schema-check.js';
import receiptSchema from '../src/provider/render-receipt-v1.schema.json' with { type: 'json' };
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES } from '../src/svg/index.js';
export const fixture = {
  schema_version: 'plot-ts.svg-figure/v1', figure: { width: 960, height: 740, title: 'Supplied quarterly observations', theme: 'sage', columns: 2 },
  charts: [
    { type: 'column', categories: ['North', 'South', 'West'], legend: 'series-names-v1', labels: true, stacked: true, series: [{ name: 'Observed', values: [12, -4, 9] }, { name: 'Forecast', values: [8, -6, null] }] },
    { type: 'line', x: [1, 2, 4, 6], legend: 'series-names-v1', series: [{ name: 'Measured', y: [-1, 3, null, 7], area: true }, { name: 'Target', y: [2, 4, 3, 6] }] },
    { type: 'scatter', points: [{ x: -3, y: 8, size: 2 }, { x: 2, y: -5, size: 8 }, { x: 6, y: 3, size: 4 }] },
    { type: 'heatmap', data: [[-3, 2, 6], [8, 0, -2]], xLabels: ['第一季度', 'Q2 & <Q>', 'Quarter three long label'], yLabels: ['Actual', 'Plan'], colormap: 'plasma' },
  ],
};
const parsed = (v: unknown) => validateInput(parseJson(Buffer.from(JSON.stringify(v))));
const reject = (fn: () => unknown, code?: string) => assert.throws(fn, (e: unknown) => e instanceof ProviderError && (!code || e.code === code));
test('strict JSON rejects ambiguity, invalid strings and syntax budgets', () => {
  for (const raw of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":{"b":1,"b":2}}', '1e400', '01', '-01', '[1,]', '{"a":1,}', 'true false', '\ufeff{}', '"\\ud800"', '"\\u0001"', '"\\uffff"', '{"x":"a\nb"}', '[', '{', '//comment\n{}']) reject(() => parseJson(Buffer.from(raw)));
  reject(() => parseJson(Buffer.from([0x22, 0xff, 0x22])), 'invalid_utf8');
  reject(() => parseJson(Buffer.from('['.repeat(17) + '0' + ']'.repeat(17))), 'depth_limit');
  assert.equal(parseJson(Buffer.from('['.repeat(16) + '0' + ']'.repeat(16))) instanceof Array, true);
  reject(() => parseJson(Buffer.from('[' + Array(16385).fill('0').join(',') + ']')), 'array_limit');
  reject(() => parseJson(Buffer.alloc(4194305, 32)), 'byte_limit');
  reject(() => parseJson(Buffer.from(JSON.stringify(Array.from({ length: 8 }, () => Array(16384).fill(0))))), 'node_limit');
  reject(() => parseJson(Buffer.from(JSON.stringify('a'.repeat(1025)))), 'string_limit');
  assert.equal(parseJson(Buffer.from('"escaped \\" \\u4e00"')), 'escaped " 一');
});
test('closed profile rejects all declared ignored options and shape problems', () => {
  const cases: [unknown, string?][] = [
    [{ ...fixture, surprise: true }, 'unknown_field'], [{ ...fixture, figure: { unit: 'm' } }, 'unknown_field'],
    [{ ...fixture, figure: { accent: 'cyan' } }, 'unsupported_option'], [{ ...fixture, figure: { animated: false } }, 'unsupported_option'],
    [{ ...fixture, figure: null }], [{ ...fixture, charts: [] }], [{ ...fixture, schema_version: 'v2' }],
  ];
  for (const [value, code] of cases) reject(() => parsed(value), code);
  for (const [i, field, value] of [[0, 'unit', ''], [1, 'unit', 'm'], [1, 'labels', false], [2, 'unit', 'm'], [2, 'xAxis', false]] as const) {
    const copy = structuredClone(fixture); Object.assign(copy.charts[i]!, { [field]: value }); reject(() => parsed(copy), 'unsupported_option');
  }
  const variants: unknown[] = [
    { type: 'column', categories: ['A'], series: [{ values: [1, 2] }] },
    { type: 'column', categories: ['A'], series: [{ values: [1], smooth: false }] },
    { type: 'line', x: [1], series: [{ y: [1] }], smooth: false },
    { type: 'column', categories: ['A'], series: [{ name: 'ignored', values: [1] }] },
    { type: 'line', x: [1], series: [{ y: [1], smooth: false }] },
    { type: 'line', x: [1], legend: 'series-names-v1', series: [{ y: [1] }] },
    { type: 'line', x: [1], legend: 'unknown', series: [{ y: [1] }] },
    { type: 'scatter', points: [{ x: 1, y: 2, size: -1 }] },
    { type: 'scatter', points: [{ x: 1, y: 2, extra: 3 }] },
    { type: 'heatmap', data: [[1], [1, 2]] }, { type: 'heatmap', data: [[]] },
    { type: 'heatmap', data: [[1]], xLabels: ['A', 'ignored'] },
    { type: 'heatmap', data: [], xLabels: ['ignored'] },
    { type: 'gauge', value: 1 }, { type: '__proto__' },
  ];
  for (const chart of variants) reject(() => parsed({ schema_version: fixture.schema_version, charts: [chart] }));
  for (const [key, value] of [['width', 0], ['height', 8193], ['columns', 1.1], ['columns', 17], ['gap', -1], ['theme', 'Sage'], ['surfacePolicy', 'transparent']]) reject(() => parsed({ ...fixture, figure: { [key!]: value } }));
});
test('exact native parity across legacy/canonical14 and all surfaces, no input mutation', () => {
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
    const source = { ...fixture, figure: { ...fixture.figure, ...(theme ? { theme } : {}), surfacePolicy } };
    if (!theme) delete (source.figure as { theme?: string }).theme;
    const before = JSON.stringify(source), input = parsed(source), f = figure(input.figure);
    for (const c of input.charts) { switch (c.type) { case 'column': f.bar(c); break; case 'line': f.line(c); break; case 'scatter': f.scatter(c); break; case 'heatmap': f.heatmap(c); break; } }
    assert.equal(renderInput(input), f.render()); assert.equal(JSON.stringify(source), before);
  }
  const basic = { schema_version: fixture.schema_version, charts: [{ type: 'column', categories: ['A'], series: [{ values: [2] }] }] };
  assert.equal(renderInput(parsed(basic)), figure().bar({ categories: ['A'], series: [{ values: [2] }] }).render());
  const changed = structuredClone(fixture); (changed.charts[2] as { points: { x: number }[] }).points[0]!.x = -7;
  assert.notEqual(renderInput(parsed(fixture)), renderInput(parsed(changed)));
});
test('empty profiles, data budget boundaries, native name and geometry rejection', () => {
  const charts = [{ type: 'column', categories: [], series: [{ values: [] }] }, { type: 'line', x: [], series: [{ y: [] }] }, { type: 'scatter', points: [] }, { type: 'heatmap', data: [] }];
  assert.match(renderInput(parsed({ schema_version: fixture.schema_version, charts })), /<svg/);
  const field = { type: 'heatmap', data: Array.from({ length: 128 }, () => Array(128).fill(1)) };
  assert.equal(parsed({ schema_version: fixture.schema_version, charts: Array(4).fill(field) }).charts.length, 4);
  reject(() => parsed({ schema_version: fixture.schema_version, charts: [...Array(4).fill(field), { type: 'scatter', points: [{ x: 1, y: 1 }] }] }), 'data_limit');
  reject(() => parsed({ schema_version: fixture.schema_version, charts: [{ type: 'heatmap', data: Array.from({ length: 129 }, () => Array(128).fill(1)) }] }), 'chart_data_limit');
  for (const names of [['same', 'same'], ['A\nB', 'C'], [' ', 'C'], ['x'.repeat(129), 'C']]) {
    reject(() => renderInput(parsed({ schema_version: fixture.schema_version, charts: [{ type: 'column', categories: ['A'], legend: 'series-names-v1', series: names.map(name => ({ name, values: [1] })) }] })));
  }
  reject(() => renderInput(parsed({ ...fixture, figure: { width: 160, height: 120 } })), 'native_render_rejected');
});
test('typed path-free receipt self-check binds original bytes and actual SVG', () => {
  const raw = Buffer.from(JSON.stringify(fixture) + '\n'), input = parsed(fixture), svg = Buffer.from(renderInput(input));
  const bytes = makeReceipt(input, raw, svg, '1.0.0'), receipt = JSON.parse(bytes.toString());
  schemaCheck(receipt, receiptSchema);
  assert.equal(receipt.artifact_receipt.inputs[0].bytes, raw.length);
  assert.equal(receipt.artifact_receipt.primary.bytes, svg.length);
  assert.deepEqual(receipt.figure.legend_panels, [{ panel_index: 0, profile: 'series-names-v1' }, { panel_index: 1, profile: 'series-names-v1' }]);
  assert.equal(receipt.limitations.length, 8);
  assert.ok(!bytes.includes('/workspace')); assert.ok(!bytes.includes('Supplied quarterly'));
  const modified = structuredClone(receipt); modified.artifact_receipt.primary.extra = 1;
  reject(() => schemaCheck(modified, receiptSchema), 'receipt_invalid');
  delete modified.artifact_receipt.primary.extra; modified.profile = 'plot-ts-svg-entry-frame/1';
  reject(() => schemaCheck(modified, receiptSchema), 'receipt_invalid');
});
