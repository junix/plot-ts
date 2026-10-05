import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const hash = b => createHash('sha256').update(b).digest('hex');
const root = process.cwd(), temporary = fs.mkdtempSync(join(tmpdir(), 'plot-provider-package-'));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
// Suppress Node's environment-specific startup warnings, not provider diagnostics.
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' };
const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary, '--cache', join(temporary, 'cache')], { cwd: root, env, encoding: 'utf8' }))[0];
const consumer = join(temporary, 'consumer'); fs.mkdirSync(consumer);
execFileSync('tar', ['-xzf', join(temporary, packed.filename), '-C', consumer]);
const manifest = JSON.parse(fs.readFileSync(join(consumer, 'package/package.json'))), script = join(consumer, 'package', manifest.bin['plot-provider-plot-ts']);
const standalone = join(temporary, 'plot-provider-plot-ts'); fs.copyFileSync(script, standalone); fs.chmodSync(standalone, 0o755);
const bin = join(consumer, 'bin'); fs.mkdirSync(bin); fs.symlinkSync(script, join(bin, 'plot-provider-plot-ts'));
const run = (args, extra = {}) => spawnSync(process.execPath, [standalone, ...args], { cwd: temporary, env, encoding: 'utf8', timeout: 10000, ...extra });
const input = join(temporary, 'input.json'), output = join(temporary, 'figure.svg'), receipt = join(temporary, 'receipt.json');
const data = { schema_version: 'plot-ts.svg-figure/v1', charts: [{ type: 'column', categories: ['A', 'B'], legend: 'series-names-v1', series: [{ name: 'Source & <data>', values: [2, -3] }] }] };
const raw = Buffer.from(JSON.stringify(data) + '\n'); fs.writeFileSync(input, raw);
const args = () => ['render-svg', input, '--resource-pins', JSON.stringify({ input: hash(fs.readFileSync(input)) }), '--output', output, '--receipt', receipt];
test('actual packed bin and standalone copy execute without runtime dependencies', () => {
  assert.equal(manifest.bin['plot-provider-plot-ts'], 'dist/plot-provider-plot-ts.cjs');
  assert.ok(fs.statSync(script).mode & 0o111); assert.ok(fs.readFileSync(script, 'utf8').startsWith('#!/usr/bin/env node\n'));
  const described = JSON.parse(execFileSync(join(bin, 'plot-provider-plot-ts'), ['describe', '--json'], { cwd: temporary, env, encoding: 'utf8' }));
  assert.equal(described.provider.id, 'plot-provider-plot-ts'); assert.deepEqual(described.operations, ['render-svg', 'render-svg-v2', 'render-svg-frame-v1', 'render-svg-scaled-v1']);
  assert.equal(described.source.local_code_path, fs.realpathSync(root));
  assert.equal(JSON.parse(run(['doctor', '--json']).stdout).ok, true);
  const result = run(args()); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '');
  const svg = fs.readFileSync(output), r = JSON.parse(fs.readFileSync(receipt));
  assert.equal(r.artifact_receipt.inputs[0].sha256, hash(raw)); assert.equal(r.artifact_receipt.primary.sha256, hash(svg));
  assert.equal(r.artifact_receipt.primary.bytes, svg.length); assert.ok(svg.includes('Source &amp; &lt;data&gt;'));
  assert.equal(r.runtime.node, process.versions.node); assert.ok(!fs.readFileSync(receipt, 'utf8').includes(temporary));
});
test('bundle has only allowlisted builtins; provenance binds source and script bytes', () => {
  const bundle = fs.readFileSync(script, 'utf8'), imports = [...bundle.matchAll(/require\("([^"]+)"\)/g)].map(m => m[1]);
  assert.ok(imports.length > 0); assert.ok(imports.every(i => ['node:fs', 'node:path', 'node:crypto'].includes(i)));
  assert.doesNotMatch(bundle, /\beval\s*\(|\bnew Function\s*\(|\bimport\s*\(/);
  const provenance = JSON.parse(fs.readFileSync(join(consumer, 'package/dist/plot-provider-build.json')));
  assert.equal(provenance.script_sha256, hash(fs.readFileSync(script)));
  for (const [name, expected] of Object.entries(provenance.source_sha256)) assert.equal(hash(fs.readFileSync(join(root, name))), expected);
});
test('strict CLI/pins/JSON fail before publication with old pair preserved', () => {
  const old = () => { fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT'); };
  const reject = a => { old(); const r = run(a); assert.notEqual(r.status, 0); assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT'); assert.equal(r.stdout, ''); assert.ok(!r.stderr.includes(temporary)); };
  for (const a of [[], ['render-frame-svg'], ['describe'], ['describe', '--json', '--json'], [...args(), '--extra'], args().map(x => x === '--receipt' ? '--output' : x)]) reject(a);
  const pinIndex = args().indexOf('--resource-pins') + 1;
  for (const pins of ['{}', '{"input":"' + '0'.repeat(64) + '"}', '{"input":"' + hash(raw) + '","input":"' + hash(raw) + '"}', JSON.stringify({ input: hash(raw), other: 'x' })]) { const a = args(); a[pinIndex] = pins; reject(a); }
  for (const json of ['{"schema_version":"plot-ts.svg-figure/v1","charts":[],"charts":[]}', '{"schema_version":"plot-ts.svg-figure/v1","charts":[{"type":"scatter","points":[{"x":1e400,"y":0}]}]}']) { fs.writeFileSync(input, json); reject(args()); }
  fs.writeFileSync(input, raw);
  for (const resource of ['-', 'https://example.com/input.json', temporary, '/dev/null']) { const a = args(); a[1] = resource; reject(a); }
  const fifo = join(temporary, 'fifo'); execFileSync('mkfifo', [fifo]); const a = args(); a[1] = fifo; reject(a);
  const a2 = args(); a2[a2.indexOf('--output') + 1] = input; reject(a2); assert.deepEqual(fs.readFileSync(input), raw);
});
test('clean launch diagnostics disclose and cannot prevent already-run Node preloads', () => {
  const d = run(['doctor', '--json'], { env: { ...env, NODE_OPTIONS: '--no-warnings' } });
  assert.equal(JSON.parse(d.stdout).ok, false); assert.ok(JSON.parse(d.stdout).items[0].missing.includes('clean-node-environment'));
  assert.notEqual(run(args(), { env: { ...env, NODE_PATH: temporary } }).status, 0);
  const preload = join(temporary, 'preload.cjs'), marker = join(temporary, 'preload-ran');
  fs.writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`);
  const r = run(args(), { env: { ...env, NODE_OPTIONS: '--require=' + preload } });
  assert.notEqual(r.status, 0); assert.equal(fs.readFileSync(marker, 'utf8'), 'ran');
});

test('V1 command serialized bytes stay frozen; V2 is a separate explicitly negotiated leaf', () => {
  const d = JSON.parse(run(['describe', '--json']).stdout);
  assert.equal(JSON.stringify(d.commands[0]) + '\n', fs.readFileSync(join(root, 'tests/fixtures/provider-render-svg-v1.command.json'), 'utf8'));
  assert.deepEqual(d.commands.map(c => c.name), ['render-svg', 'render-svg-v2', 'render-svg-frame-v1', 'render-svg-scaled-v1', 'describe', 'doctor']);
  const v2 = d.commands[1];
  assert.equal(v2.capability_id, 'visualization.plot-ts.render-svg-v2');
  assert.deepEqual(v2.suggested_command_path, ['visualization', 'plot-ts', 'render-svg-v2']);
  assert.deepEqual(v2.input_schema.properties.receipt['x-acme-receipt-core'], d.commands[0].input_schema.properties.receipt['x-acme-receipt-core']);
  assert.deepEqual(v2['x-plot-ts-document-schema'], JSON.parse(fs.readFileSync(join(root, 'src/provider/svg-figure-v2.schema.json'))));
  assert.deepEqual(v2['x-plot-ts-receipt-schema'], JSON.parse(fs.readFileSync(join(root, 'src/provider/render-receipt-v2.schema.json'))));
});
const numericData = { schema_version: 'plot-ts.svg-figure/v2', figure: { width: 920, height: 600, columns: 2 }, charts: [
  { type: 'column', axes: 'numeric-axes-v1', unit: 'µg/m³', categories: ['A', 'B'], labels: false, stacked: true, legend: 'series-names-v1', series: [{ name: 'Observed', values: [2, -3] }, { name: 'Model', values: [1, -2] }] },
  { type: 'line', axes: 'numeric-axes-v1', unit: '  mV  ', xUnit: 's <&>', x: [2, 0, 1], series: [{ y: [0.2, null, 0.3], area: true }] },
  { type: 'scatter', axes: 'numeric-axes-v1', unit: 'mol/L', xUnit: '秒', points: [{ x: 0.01, y: 0.00012 }, { x: 0.03, y: 0.00019 }] },
  { type: 'heatmap', data: [[1, 2]], xLabels: ['一', '二'] },
] };
const argsV2 = () => { const a = args(); a[0] = 'render-svg-v2'; return a; };
test('packed and dependency-free standalone V2 render literal units and exact direct-native bytes', async () => {
  const { figure } = await import(new URL('../dist/svg.js', import.meta.url));
  for (const document of [numericData, { schema_version: 'plot-ts.svg-figure/v2', charts: [{ type: 'scatter', axes: 'numeric-axes-v1', points: [{ x: 0, y: 0.00003 }] }] }, { schema_version: 'plot-ts.svg-figure/v2', charts: [{ type: 'heatmap', data: [] }] }]) {
    fs.writeFileSync(input, JSON.stringify(document));
    const f = figure(document.figure);
    for (const c of document.charts) f[c.type === 'column' ? 'bar' : c.type](c);
    const expected = f.render();
    for (const executable of [script, standalone]) {
      const result = spawnSync(process.execPath, [executable, ...argsV2()], { cwd: temporary, env, encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '');
      assert.equal(fs.readFileSync(output, 'utf8'), expected);
      const r = JSON.parse(fs.readFileSync(receipt));
      assert.equal(r.schema_version, 'plot-ts.render-receipt/v2'); assert.equal(r.profile, 'plot-ts-svg-static-numeric-axes/1');
      assert.equal(r.artifact_receipt.inputs[0].sha256, hash(fs.readFileSync(input)));
      assert.equal(r.artifact_receipt.primary.sha256, hash(fs.readFileSync(output)));
      assert.equal(r.figure.numeric_axes_panels.length, document.charts.filter(c => c.type !== 'heatmap').length);
      assert.ok(!r.limitations.some(l => l.code === 'numeric-axis-labels-unavailable'));
    }
  }
  fs.writeFileSync(input, raw);
});
test('V1/V2 negotiation and V2 hostile inputs preserve the old pair before any output', async () => {
  const reject = (document, command = 'render-svg-v2', expectedCode) => {
    fs.writeFileSync(input, typeof document === 'string' ? document : JSON.stringify(document));
    fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT');
    const a = args(); a[0] = command; const result = run(a);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes(temporary));
    if (expectedCode) assert.equal(JSON.parse(result.stderr).code, expectedCode);
    assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
  };
  reject(data, 'render-svg-v2', 'unsupported_schema'); reject(numericData, 'render-svg', 'unsupported_schema');
  for (const axes of [undefined, null, false, '', 'numeric-axes-v2']) {
    const d = structuredClone(numericData); d.charts[0].axes = axes; reject(d);
  }
  for (const key of ['axes', 'unit', 'xUnit', 'xAxis', 'yAxis']) for (const value of [false, null, '', true]) reject({ schema_version: 'plot-ts.svg-figure/v2', charts: [{ type: 'heatmap', data: [], [key]: value }] });
  for (const field of ['unit', 'xUnit']) for (const value of [null, false, '', ' ', 'x\ny', 'x'.repeat(129)]) {
    const d = structuredClone(numericData); d.charts[1][field] = value; reject(d);
  }
  reject('{"schema_version":"plot-ts.svg-figure/v2","charts":[],"\\u0063harts":[]}');
  reject({ schema_version: 'plot-ts.svg-figure/v2', charts: [{ type: 'column', axes: 'numeric-axes-v1', categories: ['A'], series: [{ values: [20] }], max: 1 }] }, 'render-svg-v2', 'native_render_rejected');
  reject({ ...numericData, figure: { width: 100, height: 100 } }, 'render-svg-v2', 'native_render_rejected');
  // A valid, bounded document exceeds the SVG cap; no oversized output is opened.
  const matrix = Array.from({ length: 128 }, () => Array(128).fill(1));
  const labels = Array(128).fill('é'.repeat(1024));
  const oversized = { schema_version: 'plot-ts.svg-figure/v2', figure: { width: 8192, height: 8192 }, charts: Array.from({ length: 4 }, () => ({ type: 'heatmap', data: matrix, xLabels: labels, yLabels: labels })) };
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) < 4 * 1024 * 1024);
  const { figure } = await import(new URL('../dist/svg.js', import.meta.url));
  const direct = figure(oversized.figure);
  for (const chart of oversized.charts) direct.heatmap(chart);
  assert.ok(Buffer.byteLength(direct.render()) > 8 * 1024 * 1024); // memory only
  reject(oversized, 'render-svg-v2', 'artifact_limit');
  fs.writeFileSync(input, raw);
});
test('V2 shares strict pins, FIFO/alias protection and clean-launch preflight', () => {
  fs.writeFileSync(input, JSON.stringify(numericData));
  const reject = (a, extra = {}) => {
    fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT'); const result = run(a, extra);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
  };
  for (const pins of ['{}', '{"input":"' + '0'.repeat(64) + '"}', '{"input":"a","input":"b"}']) { const a = argsV2(); a[3] = pins; reject(a); }
  const a = argsV2(); a[1] = join(temporary, 'fifo'); reject(a);
  const b = argsV2(); b[5] = input; reject(b);
  const c = argsV2(); c[7] = output; reject(c);
  const link = join(temporary, 'v2-link.svg'); fs.symlinkSync(output, link); const d = argsV2(); d[5] = link; reject(d);
  reject(argsV2(), { env: { ...env, NODE_PATH: temporary } });
  reject(argsV2(), { env: { ...env, NODE_OPTIONS: '--require=' + join(temporary, 'preload.cjs') } });
  fs.writeFileSync(input, raw);
});

test('both packed and standalone binaries negotiate the complete command/schema matrix', () => {
  for (const executable of [script, standalone]) for (const [command, expected] of [['render-svg', 1], ['render-svg-v2', 2]]) for (const [version, document] of [[1, data], [2, numericData]]) {
    fs.writeFileSync(input, JSON.stringify(document)); fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT');
    const a = args(); a[0] = command;
    const result = spawnSync(process.execPath, [executable, ...a], { cwd: temporary, env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.stdout, '');
    if (version === expected) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(fs.readFileSync(receipt)).schema_version, `plot-ts.render-receipt/v${version}`);
    } else {
      assert.notEqual(result.status, 0); assert.equal(JSON.parse(result.stderr).code, 'unsupported_schema');
      assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
    }
  }
  for (const [command, version] of [['render-svg', 1], ['render-svg-v2', 2]]) {
    fs.writeFileSync(input, JSON.stringify({ schema_version: `plot-ts.svg-figure/v${version}`, charts: [{ type: 'line', axes: 'numeric-axes-v1', unit: '\ud800', x: [0], series: [{ y: [1] }] }] }));
    fs.writeFileSync(output, 'OLD-SVG'); fs.writeFileSync(receipt, 'OLD-RECEIPT');
    const a = args(); a[0] = command; const result = run(a);
    assert.notEqual(result.status, 0); assert.equal(JSON.parse(result.stderr).field, version === 2 ? '$.charts[0].unit' : '$');
    assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
  }
  fs.writeFileSync(input, raw);
});
