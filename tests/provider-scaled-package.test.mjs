import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { figure } from '../dist/svg.js';
import { validateScaledInput } from '../src/provider/input-scaled.ts';
import { makeScaledReceipt, validateScaledReceipt } from '../src/provider/receipt-scaled.ts';
const hash = b => createHash('sha256').update(b).digest('hex');
const root = process.cwd(), temporary = fs.mkdtempSync(join(tmpdir(), 'plot-provider-scaled-package-'));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' };
const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary, '--cache', join(temporary, 'cache')], { cwd: root, env, encoding: 'utf8' }))[0];
const consumer = join(temporary, 'consumer'); fs.mkdirSync(consumer);
execFileSync('tar', ['-xzf', join(temporary, packed.filename), '-C', consumer]);
const script = join(consumer, 'package/dist/plot-provider-plot-ts.cjs');
const standalone = join(temporary, 'plot-provider-plot-ts'); fs.copyFileSync(script, standalone); fs.chmodSync(standalone, 0o755);
const input = join(temporary, 'input.json'), output = join(temporary, 'figure.svg'), receipt = join(temporary, 'receipt.json');
const build = JSON.parse(fs.readFileSync(join(root, 'dist/plot-provider-build.json')));
const axes = 'scaled-axes-v1', schema_version = 'plot-ts.svg-scaled-figure/v1';
const line = { type: 'line', axes, x: [1, 10, 100], series: [{ y: [1, null, 100] }] };
const scatter = { type: 'scatter', axes, points: [{ x: 1, y: 1, size: 0 }, { x: 100, y: 100, size: 25.125 }] };
const d = { schema_version, figure: { width: 1400, height: 600, columns: 2, title: 'Native <&> supplied data', theme: 'sage', surfacePolicy: 'transparent-auto-v1' }, charts: [{ ...line, unit: 'µg/m³', xUnit: '秒', legend: 'series-names-v1', series: [{ name: 'One <&>', y: [1, null, 100], area: false, smooth: false }], labels: false }, scatter] };
const native = document => { const f = figure(document.figure); for (const c of document.charts) f[c.type](c); return f.render(); };
const write = document => fs.writeFileSync(input, typeof document === 'string' ? document : JSON.stringify(document));
const args = (command = 'render-svg-scaled-v1') => [command, input, '--resource-pins', JSON.stringify({ input: hash(fs.readFileSync(input)) }), '--output', output, '--receipt', receipt];
const run = (a, executable = standalone, extra = {}) => spawnSync(process.execPath, [executable, ...a], { cwd: temporary, env, encoding: 'utf8', timeout: 30000, ...extra });
const oldPair = () => { fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT'); };
const reject = (a, code, executable = standalone, extra = {}) => {
  oldPair(); const before = fs.readFileSync(input), names = fs.readdirSync(temporary); const result = run(a, executable, extra);
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes(temporary));
  if (code) assert.equal(JSON.parse(result.stderr).code, code);
  assert.deepEqual(fs.readFileSync(input), before); assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
  assert.ok(!fs.readdirSync(temporary).some(n => n.startsWith('.plot-ts-'))); return result;
};
function parity(document, executable) {
  write(document); const raw = fs.readFileSync(input), expected = Buffer.from(native(document));
  const r = run(args(), executable); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '');
  assert.deepEqual(fs.readFileSync(output), expected);
  const validated = validateScaledInput(document), bytes = fs.readFileSync(receipt);
  assert.deepEqual(bytes, makeScaledReceipt(validated, raw, expected, '1.0.0', build.native_source.sha256));
  validateScaledReceipt(JSON.parse(bytes), validated, raw, expected, '1.0.0', build.native_source.sha256);
  assert.ok(!bytes.includes(Buffer.from(temporary))); return bytes;
}

test('fourth command is exact standalone descriptor; old complete command fixtures are unchanged', () => {
  const described = JSON.parse(run(['describe', '--json']).stdout);
  assert.deepEqual(described.operations, ['render-svg', 'render-svg-v2', 'render-svg-frame-v1', 'render-svg-scaled-v1']);
  assert.deepEqual(described.commands.map(c => c.name), [...described.operations, 'describe', 'doctor']);
  for (const [i, suffix] of ['v1', 'v2', 'frame-v1', 'scaled-v1'].entries()) assert.equal(JSON.stringify(described.commands[i]) + '\n', fs.readFileSync(join(root, `tests/fixtures/provider-render-svg-${suffix}.command.json`), 'utf8'));
  for (const command of described.commands.filter(c => c.capability_id)) assert.match(command.description, /[.!?。！？]$/, 'Hub capability descriptions require terminal sentence punctuation');
  const c = described.commands[3]; assert.equal(c.capability_id, 'visualization.plot-ts.render-svg-scaled-v1');
  assert.deepEqual(c.input_schema.required, ['input', 'resource_pins', 'output', 'receipt']);
  assert.deepEqual(c.input_schema.properties.receipt['x-acme-receipt-core'], described.commands[2].input_schema.properties.receipt['x-acme-receipt-core']);
  assert.equal(c.limits.chart_positions, 16384); assert.equal(c.limits.line_series, 8); assert.equal(c.limits.numeric_data_scalars, 65536);
  assert.equal(build.native_source.sha256, 'f15171054f6a55a7a0675599266589da9b6ddf9e1920548103a68deace3fd701');
  assert.equal(build.script_sha256, hash(fs.readFileSync(standalone)));
  const pairs = Object.entries(build.source_sha256).filter(([p]) => /^(src\/svg|src\/style|src\/util)\//.test(p)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  assert.deepEqual(build.native_source.files, pairs); assert.equal(hash(JSON.stringify(pairs)), build.native_source.sha256);
  for (const [name, value] of pairs) assert.equal(hash(fs.readFileSync(join(root, name))), value);
  const doctor = run(['doctor', '--json']); assert.equal(doctor.status, 0); assert.equal(JSON.parse(doctor.stdout).ok, true);
  assert.equal(JSON.parse(doctor.stdout).runtime.node, process.versions.node);
});

test('packed and dependency-free standalone render all scale combinations with full typed receipt byte parity', () => {
  for (const executable of [script, standalone]) for (const xScale of ['linear', 'log10']) for (const yScale of ['linear', 'log10']) {
    parity({ ...d, charts: d.charts.map(c => ({ ...c, xScale, yScale, xDomain: [0.1, 1000], yDomain: [0.01, 1000] })) }, executable);
    for (const charts of [
      [{ ...line, x: [], series: [{ y: [] }] }, { ...scatter, points: [] }],
      [{ ...line, x: [3, 1, 3], series: [{ y: [null, null, null] }] }],
      [{ ...line, x: [2, 2], series: [{ y: [3, 3] }], xDomain: [2, 2], yDomain: [3, 3] }, { ...scatter, points: [{ x: 2, y: 3, size: 0 }] }],
    ]) parity({ ...d, charts: charts.map(c => ({ ...c, xScale, yScale })) }, executable);
  }
  for (const executable of [script, standalone]) {
    const extreme = [Number.MIN_VALUE, 1, Number.MAX_VALUE];
    parity({ ...d, charts: [{ ...line, xScale: 'log10', yScale: 'log10', x: extreme, series: [{ y: extreme }] }, { ...scatter, xScale: 'log10', yScale: 'log10', points: extreme.map(v => ({ x: v, y: v, size: 0 })) }] }, executable);
    assert.deepEqual(parity(d, executable), parity(d, executable));
  }
});

test('four commands and four schemas never cross-admit or automatically upgrade', () => {
  const cases = [
    ['render-svg', { schema_version: 'plot-ts.svg-figure/v1', charts: [{ type: 'line', x: [1, 2], series: [{ y: [1, 2] }] }] }],
    ['render-svg-v2', { schema_version: 'plot-ts.svg-figure/v2', charts: [{ type: 'line', axes: 'numeric-axes-v1', x: [1, 2], series: [{ y: [1, 2] }] }] }],
    ['render-svg-frame-v1', { schema_version: 'plot-ts.svg-frame/v1', frame: { profile: 'entry-v1', time_ms: 150, reduced_motion: false }, charts: [{ type: 'line', axes: 'numeric-axes-v1', x: [1, 2], series: [{ y: [1, 2] }] }] }],
    ['render-svg-scaled-v1', d],
  ];
  for (const executable of [script, standalone]) for (const [command] of cases) for (const [other, document] of cases) {
    write(document); if (command !== other) reject(args(command), undefined, executable);
    else { const r = run(args(command), executable); assert.equal(r.status, 0, r.stderr); }
  }
});

test('invalid data, domains, parser/budget and fit failures preserve exact prior pair and source', () => {
  for (const charts of [
    [{ ...line, xScale: 'log10', x: [0, 10, 100] }], [{ ...line, yScale: 'log10', series: [{ y: [1, null, -1] }] }],
    [{ ...line, xDomain: [2, 100] }], [{ ...line, yDomain: [1, 99] }], [{ ...scatter, xScale: 'log10', points: [{ x: 0, y: 1 }] }],
  ]) { write({ ...d, charts }); reject(args(), 'native_render_rejected'); }
  write({ ...d, figure: { width: 10, height: 10 } }); reject(args(), 'native_render_rejected');
  for (const raw of ['{"schema_version":"a","schema_\\u0076ersion":"b"}', JSON.stringify(d).replace('[1,10,100]', '[1e400,10,100]'), JSON.stringify(d).padEnd(4194305, ' ')]) { write(raw); reject(args()); }
  for (const charts of [
    Array(17).fill(line), [{ ...line, series: Array(9).fill({ y: [1, null, 100] }) }],
    [{ ...line, x: Array(2049).fill(1), series: Array(8).fill({ y: Array(2049).fill(null) }) }],
    [{ ...scatter, points: Array(16385).fill({ x: 1, y: 1 }) }],
    [...Array(2).fill({ ...line, x: Array(16384).fill(1), series: [{ y: Array(16384).fill(null) }] }), { ...line, x: [1], series: [{ y: [null] }] }],
  ]) { write({ ...d, charts }); reject(args()); }
  write({ ...d, charts: [{ ...line, xScale: 'log10', x: [0, 10, 100] }, { ...line, x: Array(16385).fill(1), series: [{ y: Array(16385).fill(null) }] }] }); reject(args(), 'array_limit');
  for (const charts of [[{ ...line, series: [{ y: [1, null, 100], area: true }] }], [{ ...line, axes: 'numeric-axes-v1' }], [{ ...scatter, points: [{ x: 1, y: 1, size: 1025 }] }]]) { write({ ...d, charts }); reject(args()); }
  write(d); for (const a of [[...args(), '--frame', '0'], args().map(v => v === '--receipt' ? '--output' : v)]) reject(a, 'invalid_arguments');
});

test('raw pins, aliases, destination symlinks/hardlinks, FIFO and runtime contamination fail safely', () => {
  write(d);
  for (const pin of ['{}', '{"input":"a","input":"b"}', JSON.stringify({ input: '0'.repeat(64) })]) { const a = args(); a[3] = pin; reject(a); }
  const stale = args(); fs.appendFileSync(input, ' '); reject(stale, 'input_pin_mismatch'); write(d);
  for (const [i, path] of [[5, input], [7, input], [7, output]]) { const a = args(); a[i] = path; reject(a); }
  const link = join(temporary, 'link.svg'); fs.symlinkSync(output, link); const a = args(); a[5] = link; reject(a);
  const hard = join(temporary, 'hard.svg'); fs.linkSync(output, hard); const b = args(); b[5] = hard; reject(b); fs.unlinkSync(hard);
  const fifo = join(temporary, 'fifo'); execFileSync('mkfifo', [fifo]); const c = args(); c[1] = fifo; reject(c);
  const inputLink = join(temporary, 'input-link'); fs.symlinkSync(input, inputLink); const e = args(); e[1] = inputLink;
  const read = run(e); assert.equal(read.status, 0, read.stderr); // Existing transport resolves input symlinks, then rechecks exact pinned regular bytes.
  reject(args(), 'runtime_not_ready', standalone, { env: { ...env, NODE_PATH: temporary } });
  const preload = join(temporary, 'preload.cjs'); fs.writeFileSync(preload, '// Runtime guard proves nonempty options; preloads may already have executed.\n');
  reject(args(), 'runtime_not_ready', standalone, { env: { ...env, NODE_OPTIONS: '--require=' + preload } });
});

test('exact machine position/scalar limits retain native parity rather than truncating supplied slots', () => {
  const allNull = { ...line, xScale: 'log10', yScale: 'log10', x: Array(16384).fill(1), series: [{ y: Array(16384).fill(null) }] };
  parity({ ...d, charts: [allNull, allNull] }, standalone);
  parity({ ...d, charts: [{ ...line, xScale: 'log10', yScale: 'log10', x: Array(2048).fill(1), series: Array(8).fill({ y: Array(2048).fill(null) }) }] }, standalone);
  parity({ ...d, charts: [{ ...scatter, xScale: 'log10', yScale: 'log10', points: Array(16384).fill({ x: 1, y: 1, size: 0 }) }] }, standalone);
});
