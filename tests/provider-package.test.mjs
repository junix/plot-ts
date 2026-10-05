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
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' };
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
  assert.equal(described.provider.id, 'plot-provider-plot-ts'); assert.deepEqual(described.operations, ['render-svg']);
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
