import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { figure } from '../dist/svg.js';
const hash = b => createHash('sha256').update(b).digest('hex');
const root = process.cwd(), temporary = fs.mkdtempSync(join(tmpdir(), 'plot-provider-frame-package-'));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' };
const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary, '--cache', join(temporary, 'cache')], { cwd: root, env, encoding: 'utf8' }))[0];
const consumer = join(temporary, 'consumer'); fs.mkdirSync(consumer);
execFileSync('tar', ['-xzf', join(temporary, packed.filename), '-C', consumer]);
const script = join(consumer, 'package/dist/plot-provider-plot-ts.cjs');
const standalone = join(temporary, 'plot-provider-plot-ts'); fs.copyFileSync(script, standalone); fs.chmodSync(standalone, 0o755);
const input = join(temporary, 'input.json'), output = join(temporary, 'figure.svg'), receipt = join(temporary, 'receipt.json');
const d = { schema_version: 'plot-ts.svg-frame/v1', frame: { profile: 'entry-v1', time_ms: 180.125, reduced_motion: false }, figure: { width: 960, height: 740, columns: 2, title: '', theme: 'sage', surfacePolicy: 'transparent-auto-v1' }, charts: [
  { type: 'column', axes: 'numeric-axes-v1', unit: 'µg/m³', categories: ['', 'B'], stacked: true, legend: 'series-names-v1', series: [{ name: 'Observed', values: [2, -3] }, { name: 'Model', values: [1, null] }] },
  { type: 'line', axes: 'numeric-axes-v1', unit: '  mV  ', xUnit: 's <&>', x: [2, 0, 1], series: [{ y: [0.2, null, 0.3], area: true }] },
  { type: 'scatter', axes: 'numeric-axes-v1', unit: 'mol/L', xUnit: '秒', points: [{ x: 0.01, y: 0.00012, size: 0 }, { x: 0.03, y: 0.00019, size: 35.555 }] },
  { type: 'heatmap', data: [[1, 2]], xLabels: ['一', ''] },
] };
const native = document => { const f = figure(document.figure); for (const c of document.charts) f[c.type === 'column' ? 'bar' : c.type](c); return f; };
const write = document => fs.writeFileSync(input, typeof document === 'string' ? document : JSON.stringify(document));
const args = (command = 'render-svg-frame-v1') => [command, input, '--resource-pins', JSON.stringify({ input: hash(fs.readFileSync(input)) }), '--output', output, '--receipt', receipt];
const run = (a, executable = standalone, extra = {}) => spawnSync(process.execPath, [executable, ...a], { cwd: temporary, env, encoding: 'utf8', timeout: 20000, ...extra });
const oldPair = () => { fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT'); };
const reject = (a, code, executable = standalone, extra = {}) => {
  oldPair(); const result = run(a, executable, extra);
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes(temporary));
  if (code) assert.equal(JSON.parse(result.stderr).code, code);
  assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
};
const build = JSON.parse(fs.readFileSync(join(root, 'dist/plot-provider-build.json')));

test('both static command objects stay frozen; third leaf uses same pinned-input/receipt transport', () => {
  const described = JSON.parse(run(['describe', '--json']).stdout);
  assert.deepEqual(described.operations, ['render-svg', 'render-svg-v2', 'render-svg-frame-v1']);
  assert.deepEqual(described.commands.map(c => c.name), ['render-svg', 'render-svg-v2', 'render-svg-frame-v1', 'describe', 'doctor']);
  for (const [i, v] of [[0, 1], [1, 2]]) assert.equal(JSON.stringify(described.commands[i]) + '\n', fs.readFileSync(join(root, `tests/fixtures/provider-render-svg-v${v}.command.json`), 'utf8'));
  const c = described.commands[2];
  assert.equal(JSON.stringify(c) + '\n', fs.readFileSync(join(root, 'tests/fixtures/provider-render-svg-frame-v1.command.json'), 'utf8'));
  assert.equal(c.capability_id, 'visualization.plot-ts.render-svg-frame-v1');
  assert.deepEqual(c.cli_spec, { subcommand: ['render-svg-frame-v1'], positionals: ['input'], flags: described.commands[1].cli_spec.flags });
  assert.deepEqual(c.input_schema.required, ['input', 'resource_pins', 'output', 'receipt']);
  assert.deepEqual(c.input_schema.properties.receipt['x-acme-receipt-core'], described.commands[0].input_schema.properties.receipt['x-acme-receipt-core']);
  assert.deepEqual(c['x-plot-ts-document-schema'], JSON.parse(fs.readFileSync(join(root, 'src/provider/svg-frame-v1.schema.json'))));
  assert.deepEqual(c['x-plot-ts-receipt-schema'], JSON.parse(fs.readFileSync(join(root, 'src/provider/frame-receipt-v1.schema.json'))));
  assert.equal(c.limits.intermediate_motion_targets, 2048);
  assert.match(c.description, /no fallback/i); assert.match(c.description, /host styling/i);
});

test('three commands by three documents negotiate exactly in packed and standalone launches', () => {
  const v1 = { schema_version: 'plot-ts.svg-figure/v1', charts: [{ type: 'scatter', points: [{ x: 0, y: 1 }] }] };
  const v2 = { schema_version: 'plot-ts.svg-figure/v2', figure: d.figure, charts: d.charts };
  const cases = [['render-svg', v1, 'plot-ts.render-receipt/v1'], ['render-svg-v2', v2, 'plot-ts.render-receipt/v2'], ['render-svg-frame-v1', d, 'plot-ts.frame-receipt/v1']];
  for (const executable of [script, standalone]) for (const [command, document, receiptSchema] of cases) for (const [other, value] of cases) {
    write(value); const a = args(command);
    if (command !== other) { reject(a, undefined, executable); continue; }
    const result = run(a, executable); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '');
    assert.equal(JSON.parse(fs.readFileSync(receipt)).schema_version, receiptSchema);
  }
});

test('packed/standalone frame bytes match native original documents, repeated seek, final and reduced', () => {
  const f = native(d), final = f.render();
  for (const executable of [script, standalone]) {
    const seen = new Map();
    for (const time_ms of [0, 54.999, 55, 180.125, 1599.999, 1600, Number.MAX_VALUE, 180.125, 0]) {
      const document = { ...d, frame: { ...d.frame, time_ms } }; write(document);
      const result = run(args(), executable); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '');
      const actual = fs.readFileSync(output, 'utf8');
      assert.equal(actual, f.renderFrame(time_ms, { reducedMotion: false })); assert.equal(actual, native(d).renderFrame(time_ms));
      if (seen.has(time_ms)) assert.equal(actual, seen.get(time_ms)); seen.set(time_ms, actual);
      const r = JSON.parse(fs.readFileSync(receipt));
      assert.deepEqual(r.rendering, { mode: 'frame', profile: 'entry-v1', time_ms, reduced_motion: false, target_budget: { limit: 2048, policy: time_ms >= 1600 ? 'bypassed-final-time' : 'enforced' } });
      assert.equal(r.artifact_receipt.inputs[0].sha256, hash(fs.readFileSync(input))); assert.equal(r.artifact_receipt.primary.sha256, hash(actual));
      assert.equal(r.renderer_source.sha256, build.native_source.sha256); assert.equal(r.runtime.node, process.versions.node);
      assert.ok(!fs.readFileSync(receipt, 'utf8').includes(temporary)); assert.doesNotMatch(actual, /<style|<script|data-plot-motion-playback|@keyframes/);
    }
    assert.notEqual(seen.get(0), seen.get(180.125));
    for (const time_ms of [0, 0.125, 180, 1600, Number.MAX_VALUE]) {
      write({ ...d, frame: { ...d.frame, time_ms, reduced_motion: true } });
      const result = run(args(), executable); assert.equal(result.status, 0, result.stderr); assert.equal(fs.readFileSync(output, 'utf8'), final);
      assert.equal(JSON.parse(fs.readFileSync(receipt)).rendering.target_budget.policy, 'bypassed-reduced-motion');
    }
  }
});

test('source identity binds exactly actual engine inputs and final script without self-hashing', () => {
  const pairs = Object.entries(build.source_sha256).filter(([name]) => /^(src\/svg|src\/style|src\/util)\//.test(name)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  assert.deepEqual(build.native_source.files, pairs); assert.equal(build.native_source.schema_version, 'plot-ts.native-source-set/v1');
  assert.equal(build.native_source.sha256, hash(JSON.stringify(pairs)));
  assert.ok(pairs.some(([n]) => n === 'src/svg/motion.ts')); assert.ok(pairs.some(([n]) => n === 'src/svg/numeric-bounds.ts'));
  for (const [name, expected] of pairs) assert.equal(hash(fs.readFileSync(join(root, name))), expected);
  assert.equal(build.script_sha256, hash(fs.readFileSync(script)));
  assert.ok(fs.readFileSync(script, 'utf8').includes(build.native_source.sha256)); assert.ok(!fs.readFileSync(script, 'utf8').includes(build.script_sha256));
  const imports = [...fs.readFileSync(script, 'utf8').matchAll(/require\("([^"]+)"\)/g)].map(m => m[1]);
  assert.ok(imports.length); assert.ok(imports.every(i => ['node:fs', 'node:path', 'node:crypto'].includes(i)));
});

test('invalid headers/controls/data/limits reject even final/reduced and preserve old pair', () => {
  for (const key of ['profile', 'time_ms', 'reduced_motion']) { const copy = structuredClone(d); delete copy.frame[key]; write(copy); reject(args(), 'missing_field'); }
  for (const frame of [null, false, [], { ...d.frame, extra: true }, { ...d.frame, time_ms: -1 }, { ...d.frame, time_ms: '0' }, { ...d.frame, time_ms: null }, { ...d.frame, time_ms: 1600, reduced_motion: 'false' }, { ...d.frame, reduced_motion: 0 }, { ...d.frame, profile: 'entry-v2' }]) { write({ ...d, frame }); reject(args()); }
  for (const raw of ['{"schema_version":"plot-ts.svg-frame/v1","frame":{"profile":"entry-v1","time_ms":0,"\\u0074ime_ms":1,"reduced_motion":false},"charts":[]}', JSON.stringify(d).replace('180.125', '1e400')]) { write(raw); reject(args()); }
  for (const frame of [{ ...d.frame, time_ms: 1600 }, { ...d.frame, reduced_motion: true }]) {
    write({ ...d, frame, figure: { width: 1, height: 1 } }); reject(args(), 'native_render_rejected');
    write({ ...d, frame, charts: [{ type: 'column', axes: 'numeric-axes-v1', categories: ['A'], max: 1, series: [{ values: [20] }] }] }); reject(args(), 'native_render_rejected');
    write({ ...d, frame, charts: [{ type: 'scatter', axes: 'numeric-axes-v1', points: [{ x: 0, y: 0, size: 1025 }] }] }); reject(args());
  }
  write(d);
  for (const a of [[...args(), '--time-ms', '0'], [...args(), '--reduced-motion', 'false'], args().map(x => x === '--receipt' ? '--output' : x)]) reject(a, 'invalid_arguments');
  for (const pin of ['{}', JSON.stringify({ input: '0'.repeat(64) }), '{"input":"a","input":"b"}']) { const a = args(); a[3] = pin; reject(a); }
  const stale = args(); write({ ...d, frame: { ...d.frame, time_ms: 0 } }); reject(stale, 'input_pin_mismatch');
  write(d);
  const fifo = join(temporary, 'fifo'); execFileSync('mkfifo', [fifo]); const a = args(); a[1] = fifo; reject(a);
  for (const [index, path] of [[5, input], [7, output], [5, fifo]]) { const a = args(); a[index] = path; reject(a); }
  const link = join(temporary, 'link.svg'); fs.symlinkSync(output, link); const a2 = args(); a2[5] = link; reject(a2);
  const inputLink = join(temporary, 'input-link'); fs.symlinkSync(input, inputLink); const a3 = args(); a3[1] = inputLink; const symlinkRead = run(a3); assert.equal(symlinkRead.status, 0, symlinkRead.stderr); // Existing input symlinks resolve to a pinned, rechecked regular file.
  const hard = join(temporary, 'hard.svg'); fs.linkSync(output, hard); const a4 = args(); a4[5] = hard; reject(a4); fs.unlinkSync(hard);
  reject(args(), 'runtime_not_ready', standalone, { env: { ...env, NODE_PATH: temporary } });
  const preload = join(temporary, 'preload.cjs'), marker = join(temporary, 'preload-ran');
  fs.writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`);
  reject(args(), 'runtime_not_ready', standalone, { env: { ...env, NODE_OPTIONS: '--require=' + preload } }); assert.equal(fs.readFileSync(marker, 'utf8'), 'ran');
});

test('actual-wrapper cap is whole-figure rejection; explicit reduced/final stays bounded static', () => {
  for (const executable of [script, standalone]) for (const n of [2048, 2049]) {
    const document = { ...d, figure: { width: 800, height: 500 }, charts: [{ type: 'scatter', axes: 'numeric-axes-v1', points: Array.from({ length: n }, (_, i) => ({ x: i, y: i % 3, size: 0 })) }] };
    for (const time_ms of [0, 1599.999]) {
      write({ ...document, frame: { ...document.frame, time_ms } });
      if (n === 2049) reject(args(), 'motion_target_limit', executable);
      else { const r = run(args(), executable); assert.equal(r.status, 0, r.stderr); assert.equal(fs.readFileSync(output, 'utf8'), native(document).renderFrame(time_ms)); }
    }
    for (const frame of [{ ...document.frame, time_ms: 1600 }, { ...document.frame, reduced_motion: true }]) {
      write({ ...document, frame }); const r = run(args(), executable); assert.equal(r.status, 0, r.stderr); assert.equal(fs.readFileSync(output, 'utf8'), native(document).render());
    }
  }
});

test('ordinary artifact byte cap remains enforced for frame, final and reduced requests', () => {
  const matrix = Array.from({ length: 128 }, () => Array(128).fill(1)), labels = Array(128).fill('é'.repeat(1024));
  const oversized = { ...d, figure: { width: 8192, height: 8192 }, charts: Array.from({ length: 4 }, () => ({ type: 'heatmap', data: matrix, xLabels: labels, yLabels: labels })) };
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) < 4194304); assert.ok(Buffer.byteLength(native(oversized).render()) > 8388608);
  for (const frame of [d.frame, { ...d.frame, time_ms: 1600 }, { ...d.frame, reduced_motion: true }]) { write({ ...oversized, frame }); reject(args(), 'artifact_limit'); }
});
