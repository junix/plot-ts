/** Small native provider release proof. Reuses the accepted SVG engine; no browser,
 * font downloads or full image-corpus duplication. Build before running.
 * PLOT_TS_PROVIDER_AXES_EVIDENCE_DIR retains at most 512 KiB per runtime.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figure } from '../dist/svg.js';
const hash = b => createHash('sha256').update(b).digest('hex');
const temporary = mkdtempSync(join(tmpdir(), 'plot-provider-numeric-native-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
const executable = fileURLToPath(new URL('../dist/plot-provider-plot-ts.cjs', import.meta.url));
const rasterizer = process.env.PLOT_TS_RSVG_CONVERT ?? 'rsvg-convert';
const rasterizerVersion = execFileSync(rasterizer, ['--version'], { encoding: 'utf8' }).trim();
const evidenceDir = process.env.PLOT_TS_PROVIDER_AXES_EVIDENCE_DIR;
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
const measurements = [];
let savedBytes = 0;
function save(name, bytes) {
  if (!evidenceDir) return;
  savedBytes += Buffer.byteLength(bytes);
  assert.ok(savedBytes < 512 * 1024);
  writeFileSync(join(evidenceDir, name), bytes);
}
const axes = 'numeric-axes-v1';
const pm = { type: 'column', axes, unit: 'tickets', legend: 'series-names-v1', categories: ['W1', 'W2', 'W3'], series: [{ name: 'Planned', values: [42, 50, 47] }, { name: 'Completed', values: [38, 46, 49] }] };
const signed = { type: 'column', axes, unit: 'accounts', legend: 'series-names-v1', categories: ['A', 'B'], stacked: true, labels: false, series: [{ name: 'Gains', values: [12, 8] }, { name: 'Losses', values: [-5, -11] }] };
const scientific = { type: 'scatter', axes, unit: 'mol/L', xUnit: 's', points: [{ x: 0.01, y: 0.00012 }, { x: 0.02, y: 0.00019 }, { x: 0.03, y: 0.00015 }] };
const heatmap = { type: 'heatmap', data: [[-1, 2], [3, 0]], xLabels: ['Q1', 'Q2'], yLabels: ['Actual', 'Plan'], colormap: 'plasma' };
const samples = [
  ['pm-columns', { width: 400, height: 300, theme: 'sage' }, [pm]],
  ['signed-stack', { width: 400, height: 300, theme: 'azure' }, [signed]],
  ['scientific-mixed-heatmap', { width: 900, height: 360, columns: 2, theme: 'sage' }, [scientific, heatmap]],
];
for (const [name, options, charts] of samples) test(`supplied ${name} JSON has exact native SVG and raster parity`, () => {
  const source = { schema_version: 'plot-ts.svg-figure/v2', figure: options, charts };
  const raw = Buffer.from(JSON.stringify(source) + '\n');
  const input = join(temporary, `${name}.json`), output = join(temporary, `${name}.svg`), receipt = join(temporary, `${name}.receipt.json`);
  writeFileSync(input, raw);
  const stdout = execFileSync(process.execPath, [executable, 'render-svg-v2', input, '--resource-pins', JSON.stringify({ input: hash(raw) }), '--output', output, '--receipt', receipt], { cwd: temporary, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, timeout: 10000 });
  assert.equal(stdout.length, 0);
  // Independent oracle uses the original JSON fields, never provider-normalized data.
  const f = figure(source.figure);
  for (const chart of source.charts) {
    if (chart.type === 'column') f.bar(chart);
    else if (chart.type === 'scatter') f.scatter(chart);
    else f.heatmap(chart);
  }
  const actual = readFileSync(output), expected = Buffer.from(f.render());
  assert.deepEqual(actual, expected);
  const r = JSON.parse(readFileSync(receipt));
  assert.equal(r.artifact_receipt.inputs[0].sha256, hash(raw));
  assert.equal(r.artifact_receipt.primary.sha256, hash(actual));
  assert.equal(r.artifact_receipt.primary.bytes, actual.length);
  assert.equal(r.figure.numeric_axes_panels.length, 1);
  assert.equal(r.figure.numeric_axes_panels[0].axes, name === 'scientific-mixed-heatmap' ? 'xy' : 'y');
  assert.deepEqual(r.figure.numeric_axes_panels[0].unit_axes, name === 'scientific-mixed-heatmap' ? ['y', 'x'] : ['y']);
  assert.equal(r.limitations.some(x => x.code === 'numeric-axis-labels-unavailable'), false);
  const png = execFileSync(rasterizer, ['--format=png'], { input: actual, timeout: 20000, maxBuffer: 256 * 1024 });
  const nativePng = execFileSync(rasterizer, ['--format=png'], { input: expected, timeout: 20000, maxBuffer: 256 * 1024 });
  assert.deepEqual(png, nativePng);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), options.width); assert.equal(png.readUInt32BE(20), options.height);
  save(`${name}.json`, raw); save(`${name}.svg`, actual); save(`${name}.png`, png); save(`${name}.receipt.json`, readFileSync(receipt));
  measurements.push({ name, width: options.width, height: options.height, input_sha256: hash(raw), svg_sha256: hash(actual), svg_bytes: actual.length, png_sha256: hash(png), png_bytes: png.length, exact_native_svg_and_png: true });
});
after(() => save('evidence.json', JSON.stringify({ node: process.versions.node, rasterizer: rasterizerVersion, samples: measurements, limits: 'Native raster parity only. Live viewer fonts, approximate guide fit, runtime-specific domains, binary64 and SVG rounding remain.' }, null, 2) + '\n'));
