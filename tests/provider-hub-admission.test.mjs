/** Actual installed Hub acceptance; deliberately fails if no explicit Hub binaries are supplied.
 * PLOT_TS_HUB_BIN_DIR=/reviewed/bin npm run test:hub-admission
 * No compilation, download, existing-home mutation, or automatic provider route migration.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { figure } from '../dist/svg.js';
import { validateScaledInput } from '../src/provider/input-scaled.ts';
import { makeScaledReceipt } from '../src/provider/receipt-scaled.ts';
const root = process.cwd(), hubRoot = process.env.PLOT_TS_HUB_BIN_DIR;
assert.ok(hubRoot, 'Set PLOT_TS_HUB_BIN_DIR to the explicitly reviewed installed Hub binaries; this gate never skips or builds Hub');
const hub = Object.fromEntries(['plot', 'plotctl'].map(name => [name, resolve(hubRoot, name)]));
for (const path of Object.values(hub)) assert.ok(fs.statSync(path).isFile(), `Required actual Hub binary: ${path}`);
const dir = fs.mkdtempSync(join(tmpdir(), 'plot-provider-hub-admission-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
for (const name of ['bin', 'home', 'cwd']) fs.mkdirSync(join(dir, name));
const selected = join(dir, 'bin/plot-provider-plot-ts'), snapshot = join(dir, 'snapshot.json');
fs.copyFileSync(join(root, 'dist/plot-provider-plot-ts.cjs'), selected); fs.chmodSync(selected, 0o755);
fs.symlinkSync(process.execPath, join(dir, 'bin/node'));
const env = { HOME: join(dir, 'home'), PATH: join(dir, 'bin'), LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', PLOT_ACME_PROVIDER_PATH: '', PLOT_ACME_SNAPSHOT: snapshot, PLOT_ACME_ROUTES: join(dir, 'routes.json'), NODE_OPTIONS: '', NODE_PATH: '', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' };
const run = (name, args) => spawnSync(hub[name], args, { env, cwd: join(dir, 'cwd'), encoding: 'utf8', timeout: 30000 });
const good = (name, args) => { const r = run(name, args); assert.equal(r.status, 0, r.stderr); return r; };
const hash = b => createHash('sha256').update(b).digest('hex');
const capability = 'visualization.plot-ts.render-svg-scaled-v1';

test('actual pinned Hub admits four exact capabilities, renders scaled SVG/receipt, and preserves last-good snapshot on punctuation regression', () => {
  const refresh = JSON.parse(good('plotctl', ['refresh', '--pin-execution', '--json']).stdout);
  assert.equal(refresh.capabilities, 4); assert.equal(refresh.providers, 1); assert.equal(refresh.execution_identity, 'pinned');
  good('plotctl', ['route', 'set', capability, 'plot-provider-plot-ts']);
  const document = JSON.parse(fs.readFileSync(join(root, 'examples/provider-scaled-axes-v1.json'))), input = join(dir, 'input.json'), output = join(dir, 'output.svg'), receipt = join(dir, 'receipt.json');
  const raw = Buffer.from(JSON.stringify(document)); fs.writeFileSync(input, raw);
  const result = JSON.parse(good('plot', [capability, input, '--resource-pins', JSON.stringify({ input: hash(raw) }), '--output', output, '--receipt', receipt, '--json']).stdout);
  assert.equal(result.ok, true); assert.equal(result.route.provider_id, 'plot-provider-plot-ts');
  const f = figure(document.figure); for (const c of document.charts) f[c.type](c);
  const svg = Buffer.from(f.render()); assert.deepEqual(fs.readFileSync(output), svg);
  const source = JSON.parse(fs.readFileSync(join(root, 'dist/plot-provider-build.json'))).native_source.sha256;
  assert.deepEqual(fs.readFileSync(receipt), makeScaledReceipt(validateScaledInput(document), raw, svg, '1.0.0', source));
  const before = fs.readFileSync(snapshot), correct = fs.readFileSync(selected);
  const suffix = 'Script pin and exact bundled-native-source digest do not attest Node, fonts or preloads.';
  assert.equal(correct.toString().split(suffix).length, 2, 'One exact descriptor sentence to mutate');
  fs.writeFileSync(selected, correct.toString().replace(suffix, suffix.slice(0, -1)));
  const rejected = run('plotctl', ['refresh', '--pin-execution', '--json']);
  assert.equal(rejected.status, 4); assert.match(rejected.stderr, /malformed_manifest/); assert.match(rejected.stderr, /description must end with sentence punctuation/);
  assert.deepEqual(fs.readFileSync(snapshot), before, 'Failed refresh preserves the entire last-known-good snapshot');
  fs.writeFileSync(selected, correct); fs.chmodSync(selected, 0o755);
  good('plotctl', ['refresh', '--pin-execution', '--json']);
});
