import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { figure } from '../src/svg/index.js';
import { MotionTargetLimitError } from '../src/svg/motion.js';
import { validateFrameInput, renderFrameInput } from '../src/provider/input-frame.js';
import { validateInputV2, renderInputV2 } from '../src/provider/input-v2.js';
import { makeReceiptV2 } from '../src/provider/receipt-v2.js';
import { makeFrameReceipt, validateFrameReceipt } from '../src/provider/receipt-frame.js';
import { parseJson, ProviderError } from '../src/provider/json.js';
import { schemaCheck } from '../src/provider/schema-check.js';
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const sourceSha = hash('source identity fixture');
const axes = 'numeric-axes-v1';
const column = { type: 'column', axes, categories: ['', 'B', 'C'], legend: 'series-names-v1', unit: '  tickets  ', series: [{ name: 'Up <&>', values: [8, null, -4] }, { name: 'Down', values: [-2, 0, -3] }] };
const line = { type: 'line', axes, unit: 'mV', xUnit: '秒', x: [2, 0, 1], legend: 'series-names-v1', series: [{ name: 'Signal', y: [4, null, -2], area: true }] };
const scatter = { type: 'scatter', axes, unit: 'mol/L', xUnit: 's', points: [{ x: -2, y: -4, size: 0 }, { x: 2, y: 3, size: 35.555 }, { x: 0, y: 1, size: 24 }] };
const heatmap = { type: 'heatmap', data: [[-1, 2], [0, 3]], xLabels: ['', 'B'], yLabels: ['A', 'B'] };
const doc = (...charts: unknown[]) => ({ schema_version: 'plot-ts.svg-frame/v1', frame: { profile: 'entry-v1', time_ms: 180, reduced_motion: false }, figure: { width: 960, height: 740, columns: 2, title: '', theme: 'sage', surfacePolicy: 'transparent-auto-v1' }, charts });
const parsed = (value: unknown) => validateFrameInput(parseJson(Buffer.from(JSON.stringify(value)), 4194304, true));
const direct = (d: any) => { const f = figure(d.figure); for (const c of d.charts) f[c.type === 'column' ? 'bar' : c.type](c); return f; };
const reject = (fn: () => unknown, code?: string, field?: string) => assert.throws(fn, (e: unknown) => e instanceof ProviderError && (!code || e.code === code) && (!field || e.field === field));

test('frame header is closed, required and strictly typed before every shortcut', () => {
  for (const key of ['schema_version', 'frame', 'charts']) { const d: any = doc(scatter); delete d[key]; reject(() => parsed(d)); }
  for (const key of ['profile', 'time_ms', 'reduced_motion']) { const d: any = doc(scatter); delete d.frame[key]; reject(() => parsed(d), 'missing_field', `$.frame.${key}`); }
  for (const frame of [null, [], false, 0, 'entry-v1', { profile: 'entry-v1', time_ms: 0, reduced_motion: false, extra: true }]) reject(() => parsed({ ...doc(scatter), frame }));
  for (const time_ms of [-1, null, false, '', '0', Infinity, NaN]) for (const reduced_motion of [false, true]) reject(() => validateFrameInput({ ...doc(scatter), frame: { profile: 'entry-v1', time_ms, reduced_motion } }), 'invalid_number');
  for (const reduced_motion of [null, 0, 1, '', 'false']) for (const time_ms of [0, 1600, Number.MAX_VALUE]) reject(() => parsed({ ...doc(scatter), frame: { profile: 'entry-v1', time_ms, reduced_motion } }), 'expected_boolean');
  for (const profile of [null, false, '', 'entry-v2']) reject(() => parsed({ ...doc(scatter), frame: { profile, time_ms: 0, reduced_motion: true } }));
  for (const time_ms of [0, -0, 0.125, 1599.999, 1600, 1600.5, Number.MAX_VALUE]) {
    const d = { ...doc(scatter), frame: { profile: 'entry-v1', time_ms, reduced_motion: false } };
    const input = validateFrameInput(d); assert.equal(input.frame.time_ms, time_ms); assert.equal(input.frame.reduced_motion, false);
  }
  for (const raw of ['{"schema_version":"plot-ts.svg-frame/v1","frame":{"profile":"entry-v1","time_ms":0,"time_ms":1,"reduced_motion":false},"charts":[]}', '{"frame":{"time_ms":0,"\\u0074ime_ms":1}}', '{"frame":{"time_ms":1e400}}']) reject(() => parseJson(Buffer.from(raw)));
  const d: any = structuredClone(doc(line)); d.charts[0].unit = '\ud800'; reject(() => parsed(d), 'invalid_xml_text', '$.charts[0].unit');
});

test('flat V2 projection preserves options/text/order and all rejection rules', () => {
  const d = doc(column, line, scatter, heatmap), input = parsed(d);
  const v2 = validateInputV2({ schema_version: 'plot-ts.svg-figure/v2', figure: d.figure, charts: d.charts });
  assert.deepEqual(input.figure, v2.figure); assert.deepEqual(input.charts, v2.charts);
  assert.equal(input.figure?.title, ''); assert.equal((input.charts[0] as any).categories[0], '');
  for (const patch of [{ animated: false }, { animated: true }, { accent: 'red' }, { width: 0 }, { width: 8193 }]) reject(() => parsed({ ...d, figure: { ...d.figure, ...patch } }));
  for (const patch of [{ axes: undefined }, { axes: 'numeric-axes-v2' }, { yAxis: false }, { unit: '' }, { unit: 'x\ny' }, { xUnit: 's' }, { labels: null }]) reject(() => parsed(doc({ ...column, ...patch })));
  reject(() => parsed(doc({ ...scatter, points: [{ x: NaN, y: 1 }] })));
  reject(() => parsed(doc({ ...heatmap, axes })));
  reject(() => parsed(doc({ ...line, smooth: false })));
  for (const frame of [{ profile: 'entry-v1', time_ms: 1600, reduced_motion: false }, { profile: 'entry-v1', time_ms: 0, reduced_motion: true }]) {
    reject(() => renderFrameInput(parsed({ ...doc({ ...column, max: 1 }), frame })), 'native_render_rejected');
    reject(() => renderFrameInput(parsed({ ...doc(scatter), figure: { width: 1, height: 1 }, frame })), 'native_render_rejected');
  }
});

test('source frames match fresh/reused native figures for repeated and backward seeks', () => {
  const fixtures = [doc(column), doc({ ...column, stacked: true }), doc({ ...column, labels: false }), doc({ ...column, stacked: true, labels: false }), doc(scatter), doc(column, line, scatter, heatmap)];
  for (const d of fixtures) {
    const f = direct(d), staticSvg = f.render(), seen = new Map();
    for (const time_ms of [0, 54.999, 55, 150, 350, 800, 1599.999, 1600, 1601, Number.MAX_VALUE, 150, 0]) {
      const value = { ...d, frame: { ...d.frame, time_ms } }, actual = renderFrameInput(parsed(value));
      assert.equal(actual, f.renderFrame(time_ms, { reducedMotion: false }));
      assert.equal(actual, direct(d).renderFrame(time_ms, { reducedMotion: false }));
      if (seen.has(time_ms)) assert.equal(actual, seen.get(time_ms)); else seen.set(time_ms, actual);
      if (time_ms >= 1600) assert.equal(actual, staticSvg);
      assert.doesNotMatch(actual, /<style|<script|@keyframes|data-plot-motion-playback/);
    }
    assert.notEqual(seen.get(0), seen.get(150));
    for (const time_ms of [0, 180.125, 1600, Number.MAX_VALUE]) assert.equal(renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms, reduced_motion: true } })), staticSvg);
  }
});

test('short/no-target plans, static families and guide/legend bytes remain native', () => {
  for (const d of [doc(line), doc(heatmap), doc(line, heatmap), doc({ type: 'scatter', axes, points: [] })]) for (const time_ms of [0, 150, 1599.999]) assert.equal(renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms } })), direct(d).render());
  const one = doc({ type: 'scatter', axes, points: [{ x: 0, y: 0 }] });
  assert.equal(renderFrameInput(parsed({ ...one, frame: { ...one.frame, time_ms: 300 } })), direct(one).render());
  assert.notEqual(renderFrameInput(parsed({ ...one, frame: { ...one.frame, time_ms: 299.999 } })), direct(one).render());
  const d = doc(column, line, scatter, heatmap), f = direct(d);
  const extract = (s: string) => [...s.matchAll(/<g data-plot-(?:axes|legend)=[\s\S]*?<\/g>/g)].map(m => m[0]);
  assert.ok(extract(f.render()).length > 0);
  for (const t of [0, 55, 180, 1599.999]) assert.deepEqual(extract(renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms: t } }))), extract(f.render()));
});

const points = (n: number) => ({ type: 'scatter', axes, points: Array.from({ length: n }, (_, i) => ({ x: i, y: i % 3, size: 0 })) });
const bars = (n: number, stacked = false, labels = false) => ({ type: 'column', axes, categories: Array(n).fill(''), stacked, labels, series: stacked ? [{ values: Array(n).fill(5) }, { values: Array(n).fill(-3) }] : [{ values: Array(n).fill(5) }] });
test('2048 actual wrappers pass; 2049 reject wholly; only explicit final/reduced bypass', () => {
  const pairs = [
    [[points(2048)], [points(2049)]],
    [[bars(2048)], [bars(2049)]],
    [[bars(2048, true)], [bars(2049, true)]],
    [[bars(1024, false, true)], [bars(1024, false, true), points(1)]],
    [[bars(682, true, true), points(2)], [bars(682, true, true), points(3)]],
    [[points(1024), points(1024)], [points(1024), points(1025)]],
  ];
  for (const [within, over] of pairs) {
    for (const [charts, count] of [[within, 2048], [over, 2049]] as const) {
      const d = { ...doc(...charts), figure: { width: 8192, height: 1000, columns: 2 } };
      const native = direct(d);
      if (count === 2048) {
        const actual = renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms: 0 } }));
        assert.equal(actual, native.renderFrame(0)); assert.equal([...actual.matchAll(/data-plot-motion-target=/g)].length, 2048);
      } else {
        assert.throws(() => native.renderFrame(0), MotionTargetLimitError);
        for (const time_ms of [0, 150, 1599.999]) reject(() => renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms } })), 'motion_target_limit', '$.charts');
      }
      for (const frame of [{ ...d.frame, time_ms: 1600 }, { ...d.frame, time_ms: 0, reduced_motion: true }]) assert.equal(renderFrameInput(parsed({ ...d, frame })), native.render());
    }
  }
});

test('native null/zero/label-threshold ordering stays exact after guide and legend reserve', () => {
  const configs = [column, { ...column, stacked: true }, { ...column, labels: false }, { ...bars(3), series: [{ values: [0, null, 5] }] }];
  for (const chart of configs) for (const height of [220, 260, 400]) {
    const d = { ...doc(chart), figure: { width: 600, height } };
    for (const t of [0, 54.999, 55, 110, 300]) assert.equal(renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms: t } })), direct(d).renderFrame(t));
  }
  // Deliberately cross the renderer's height-conditional label boundary without
  // implementing an independent provider target-count/geometry oracle.
  const counts = new Set();
  for (const value of [0, 0.1, 0.2, 0.3, 0.5, 1, 5]) {
    const d = { ...doc({ ...bars(2, false, true), legend: 'series-names-v1', unit: 'kg', series: [{ name: 'Measured', values: [value, 5] }] }), figure: { width: 500, height: 220 } };
    const actual = renderFrameInput(parsed({ ...d, frame: { ...d.frame, time_ms: 0 } }));
    assert.equal(actual, direct(d).renderFrame(0)); counts.add([...actual.matchAll(/data-plot-motion-target=/g)].length);
  }
  assert.ok(counts.size > 1, 'fixture exercises native emitted-label threshold');
});

test('closed frame receipt preserves V2 panel evidence and truthful request/budget policy', () => {
  for (const [time_ms, reduced_motion, policy] of [[0, false, 'enforced'], [300, false, 'enforced'], [1599.999, false, 'enforced'], [1600, false, 'bypassed-final-time'], [Number.MAX_VALUE, false, 'bypassed-final-time'], [0, true, 'bypassed-reduced-motion'], [1600, true, 'bypassed-reduced-motion']] as const) {
    const d = { ...doc(column, line, scatter, heatmap), frame: { profile: 'entry-v1', time_ms, reduced_motion } }, input = parsed(d), raw = Buffer.from(JSON.stringify(d)), svg = Buffer.from(renderFrameInput(input));
    const r = JSON.parse(makeFrameReceipt(input, raw, svg, '1.0.0', sourceSha).toString());
    const v2 = validateInputV2({ schema_version: 'plot-ts.svg-figure/v2', figure: d.figure, charts: d.charts });
    const prior = JSON.parse(makeReceiptV2(v2, raw, Buffer.from(renderInputV2(v2)), '1.0.0').toString());
    assert.deepEqual(r.figure, prior.figure); assert.deepEqual(r.theme, prior.theme); assert.deepEqual(r.surface, prior.surface);
    assert.deepEqual(r.rendering, { mode: 'frame', profile: 'entry-v1', time_ms, reduced_motion, target_budget: { limit: 2048, policy } });
    assert.deepEqual(r.renderer_source, { schema_version: 'plot-ts.native-source-set/v1', sha256: sourceSha });
    for (const [i, c] of d.charts.entries()) {
      const expected = prior.limitations.filter((l: any) => l.panel_index === i);
      if (['line', 'heatmap'].includes((c as any).type)) expected.push({ panel_index: i, chart_type: (c as any).type, code: 'entry-motion-family-static' });
      expected.push({ panel_index: i, chart_type: (c as any).type, code: 'frame-host-styling-uncontrolled' });
      assert.deepEqual(r.limitations.filter((l: any) => l.panel_index === i), expected);
    }
    assert.equal(r.artifact_receipt.inputs[0].sha256, hash(raw)); assert.equal(r.artifact_receipt.primary.sha256, hash(svg));
    assert.doesNotMatch(JSON.stringify(r), /target_count|plan_end|active|complete|tickets|Signal/);
    const changes = [
      (x: any) => x.rendering.reduced_motion = !reduced_motion,
      ...[null, 'false', 0, 1].map(v => (x: any) => x.rendering.reduced_motion = v),
      (x: any) => x.rendering.time_ms = time_ms === 0 ? 1 : 0,
      (x: any) => x.rendering.time_ms = -1,
      (x: any) => x.rendering.profile = 'entry-v2',
      (x: any) => x.rendering.mode = 'static',
      (x: any) => x.rendering.target_budget.policy = policy === 'enforced' ? 'bypassed-final-time' : 'enforced',
      (x: any) => x.rendering.target_budget.limit = 2049,
      (x: any) => x.rendering.target_count = 0,
      (x: any) => delete x.rendering.reduced_motion,
      (x: any) => x.renderer_source.sha256 = '0'.repeat(64),
      (x: any) => x.renderer_source.path = '/private/source',
      (x: any) => x.renderer_source.schema_version = 'other',
      (x: any) => x.figure.numeric_axes_panels.reverse(),
      (x: any) => x.figure.numeric_axes_panels[1].unit_axes.reverse(),
      (x: any) => x.figure.legend_panels.pop(),
      (x: any) => x.limitations.reverse(),
      (x: any) => x.limitations.pop(),
      (x: any) => x.artifact_receipt.inputs[0].sha256 = '0'.repeat(64),
      (x: any) => x.artifact_receipt.primary.bytes++,
      (x: any) => x.figure.width++,
    ];
    for (const change of changes) { const copy = structuredClone(r); change(copy); reject(() => validateFrameReceipt(copy, input, raw, svg, '1.0.0', sourceSha), 'receipt_invalid'); }
    reject(() => validateFrameReceipt(r, input, raw, svg, '1.0.0', '1'.repeat(64)), 'receipt_invalid');
    reject(() => validateFrameReceipt(r, input, Buffer.concat([raw, Buffer.from(' ')]), svg, '1.0.0', sourceSha), 'receipt_invalid');
    reject(() => validateFrameReceipt(r, input, raw, Buffer.concat([svg, Buffer.from(' ')]), '1.0.0', sourceSha), 'receipt_invalid');
    validateFrameReceipt(Object.fromEntries(Object.entries(r).reverse()), input, raw, svg, '1.0.0', sourceSha);
  }
});

test('private schema checker rejects every non-boolean and static schemas remain byte-exact', () => {
  for (const v of [false, true]) schemaCheck(v, { type: 'boolean' });
  for (const v of [0, 1, null, '', 'false', [], {}, undefined]) reject(() => schemaCheck(v, { type: 'boolean' }), 'receipt_invalid');
  // Published fixture hashes are independent of the working checkout.
  for (const [name, expected] of [
    ['svg-figure-v1.schema.json', '4e83275004ee0581bf183e03463a19a419a3297f123d593c3f020a0b210957e8'],
    ['render-receipt-v1.schema.json', '78ef5e3fa7ca1beb3a9c60e0255a8717b29f8b8e173081637a5dda74a8762b34'],
    ['svg-figure-v2.schema.json', 'cd262e54d6ac757f02f653479fbb28dc36462b3aebaa398e32d6e092789de6cb'],
    ['render-receipt-v2.schema.json', '8f7c637a63c650fcc5d8d3d0def93c21ede0d02f3a9ac5b2bb74e040a4d7306d'],
  ]) assert.equal(hash(readFileSync(new URL('../src/provider/' + name, import.meta.url))), expected);
});

test('short-complete/zero lexical requests retain distinct truthful receipts and full 128 limitations', () => {
  const base = { schema_version: 'plot-ts.svg-frame/v1', frame: { profile: 'entry-v1', time_ms: 0, reduced_motion: false }, charts: [{ type: 'scatter', axes, points: [] }] };
  const make = (raw: Buffer) => { const input = validateFrameInput(parseJson(raw)), svg = Buffer.from(renderFrameInput(input)); return { svg, r: JSON.parse(makeFrameReceipt(input, raw, svg, '1.0.0', sourceSha).toString()) }; };
  const raw = Buffer.from(JSON.stringify(base)), negativeZero = Buffer.from(raw.toString().replace('"time_ms":0', '"time_ms":-0'));
  const zero = make(raw), neg = make(negativeZero), late = make(Buffer.from(JSON.stringify({ ...base, frame: { ...base.frame, time_ms: 150 } })));
  assert.deepEqual(zero.svg, neg.svg); assert.deepEqual(zero.svg, late.svg);
  assert.notEqual(zero.r.artifact_receipt.inputs[0].sha256, neg.r.artifact_receipt.inputs[0].sha256);
  assert.equal(late.r.rendering.time_ms, 150); assert.equal(late.r.rendering.target_budget.policy, 'enforced');
  const d = { ...doc(...Array.from({ length: 16 }, () => bars(1, false, true))), figure: { width: 4096, height: 4096 } };
  const input = parsed(d), inputBytes = Buffer.from(JSON.stringify(d)), svg = Buffer.from(renderFrameInput(input));
  const r = JSON.parse(makeFrameReceipt(input, inputBytes, svg, '1.0.0', sourceSha).toString());
  assert.equal(r.limitations.length, 128);
});
