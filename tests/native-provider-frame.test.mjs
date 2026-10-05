/** Supplied-document native SVG/raster frame witness. No browser/CSS playback. */
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
const temporary = mkdtempSync(join(tmpdir(), 'plot-provider-frame-native-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
const executable = fileURLToPath(new URL('../dist/plot-provider-plot-ts.cjs', import.meta.url));
const rasterizer = process.env.PLOT_TS_RSVG_CONVERT ?? 'rsvg-convert';
const rasterizerVersion = execFileSync(rasterizer, ['--version'], { encoding: 'utf8' }).trim();
const evidenceDir = process.env.PLOT_TS_PROVIDER_FRAME_EVIDENCE_DIR;
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
let savedBytes = 0; const measurements = [];
function save(name, bytes) { if (!evidenceDir) return; savedBytes += Buffer.byteLength(bytes); assert.ok(savedBytes < 768 * 1024); writeFileSync(join(evidenceDir, name), bytes); }
const source = JSON.parse(readFileSync(new URL('../examples/plot-provider-frame.json', import.meta.url)));
const f = figure(source.figure); for (const c of source.charts) f[c.type === 'column' ? 'bar' : c.type](c);
const raster = svg => execFileSync(rasterizer, ['--format=png'], { input: svg, timeout: 20000, maxBuffer: 512 * 1024 });
const final = Buffer.from(f.render()), finalPng = raster(final);

test('mixed numeric/legend supplied frames have exact native SVG/PNG parity, seek and final/reduced equality', () => {
  const seen = new Map();
  for (const [time_ms, reduced_motion] of [[0, false], [180, false], [1600, false], [180, false], [0, true]]) {
    const document = { ...source, frame: { profile: 'entry-v1', time_ms, reduced_motion } }, raw = Buffer.from(JSON.stringify(document) + '\n');
    const input = join(temporary, 'input.json'), output = join(temporary, 'output.svg'), receipt = join(temporary, 'receipt.json');
    writeFileSync(input, raw);
    const stdout = execFileSync(process.execPath, [executable, 'render-svg-frame-v1', input, '--resource-pins', JSON.stringify({ input: hash(raw) }), '--output', output, '--receipt', receipt], { cwd: temporary, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, timeout: 10000 });
    assert.equal(stdout.length, 0);
    const actual = readFileSync(output), expected = Buffer.from(f.renderFrame(time_ms, { reducedMotion: reduced_motion }));
    assert.deepEqual(actual, expected);
    const png = raster(actual); assert.deepEqual(png, raster(expected));
    assert.equal(png.readUInt32BE(16), source.figure.width); assert.equal(png.readUInt32BE(20), source.figure.height);
    if (time_ms >= 1600 || reduced_motion) { assert.deepEqual(actual, final); assert.deepEqual(png, finalPng); }
    if (time_ms === 180) assert.notEqual(hash(png), hash(finalPng));
    const key = `${time_ms}ms-${reduced_motion ? 'reduced' : 'frame'}`;
    if (seen.has(key)) assert.deepEqual(actual, seen.get(key));
    else {
      seen.set(key, actual);
      const r = JSON.parse(readFileSync(receipt));
      assert.equal(r.artifact_receipt.inputs[0].sha256, hash(raw)); assert.equal(r.artifact_receipt.primary.sha256, hash(actual));
      save(`${key}.json`, raw); save(`${key}.svg`, actual); save(`${key}.png`, png); save(`${key}.receipt.json`, readFileSync(receipt));
      measurements.push({ name: key, requested_frame: document.frame, input_sha256: hash(raw), svg_sha256: hash(actual), png_sha256: hash(png), svg_bytes: actual.length, png_bytes: png.length, native_svg_png_equal: true, renderer_source: r.renderer_source });
    }
  }
  assert.notEqual(hash(seen.get('0ms-frame')), hash(seen.get('180ms-frame')));
});
after(() => save('evidence.json', JSON.stringify({ node: process.versions.node, rasterizer: rasterizerVersion, samples: measurements, limits: 'Native raster snapshots only. No live CSS/browser playback, font measurement or browser reduced-motion assertion.' }, null, 2) + '\n'));
