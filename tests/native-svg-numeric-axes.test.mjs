/** Native-only raster release gate. Build first; no browser or downloaded fonts.
 * Optional PLOT_TS_AXES_EVIDENCE_DIR retains seven final pairs and two frames,
 * capped at 2 MiB. The theme matrix stays in memory.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES, getCanonicalTheme } from '../dist/svg.js';

const rsvg = process.env.PLOT_TS_RSVG_CONVERT ?? 'rsvg-convert';
const version = execFileSync(rsvg, ['--version'], { encoding: 'utf8' }).trim();
assert.match(version, /rsvg-convert version /);
const { createCanvas, loadImage } = createRequire(import.meta.url)('canvas');
const dir = process.env.PLOT_TS_AXES_EVIDENCE_DIR;
if (dir) mkdirSync(dir, { recursive: true });
const artifacts = [], measurements = [];
let evidenceBytes = 0;
const hash = value => createHash('sha256').update(value).digest('hex');
function save(name, bytes) {
  if (!dir) return;
  evidenceBytes += Buffer.byteLength(bytes);
  assert.ok(evidenceBytes < 2 * 1024 * 1024, 'native evidence exceeds 2 MiB cap');
  writeFileSync(join(dir, name), bytes);
  artifacts.push({ name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
}
async function raster(svg, name) {
  assert.ok(!/NaN|Infinity|undefined/.test(svg));
  const png = execFileSync(rsvg, ['--format=png', ...(name === 'scientific-scatter' ? ['--background-color=#ffffff'] : [])], { input: svg, maxBuffer: 2 * 1024 * 1024, timeout: 20000 });
  if (name) { save(name + '.svg', svg); save(name + '.png', png); }
  const image = await loadImage(png), canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}
const region = (canvas, x, y, w, h) => canvas.getContext('2d').getImageData(x, y, w, h).data;
const axes = 'numeric-axes-v1';
/** Synthetic project-management example; no real pm-data registry claim. */
const pm = { axes, unit: 'tickets', legend: 'series-names-v1', categories: ['W1', 'W2', 'W3'], series: [
  { name: 'Planned', values: [42, 50, 47] }, { name: 'Completed', values: [38, 46, 49] },
] };
const signed = { axes, unit: 'accounts', legend: 'series-names-v1', categories: ['A', 'B'], stacked: true, labels: false,
  series: [{ name: 'Gains', values: [12, 8] }, { name: 'Losses', values: [-5, -11] }] };
const scientific = { axes, unit: 'mol/L', xUnit: 's', points: [{ x: 0.01, y: 1.2e-4 }, { x: 0.02, y: 1.9e-4 }, { x: 0.03, y: 1.5e-4 }] };
const large = { axes, unit: 'µg/m³', xUnit: '時間（秒）', points: [{ x: 0, y: 0, size: 30.01 }, { x: 4, y: 4, size: 30.01 }] };
const cjk = { axes, unit: '请求/秒', xUnit: '時間（秒）', legend: 'series-names-v1', x: [0, 1, 2, 3, 4], series: [
  { name: '实测 & <A>', y: [1, 3, null, 2, 4], area: true }, { name: '预测 "B"', y: [2, 2, 3, null, 3] },
] };
const narrow = { axes, x: [1e8, 2e8], series: [{ y: [1, 2] }] };

test('seven representative panels retain full readable-guide evidence and a narrow boundary', async () => {
  let minimumWidth;
  for (let width = 120; width <= 250; width++) {
    try { figure({ width, height: 160 }).line(narrow).render(); minimumWidth = width; break; } catch (error) { assert.ok(error instanceof RangeError); }
  }
  assert.ok(minimumWidth);
  assert.throws(() => figure({ width: minimumWidth - 1, height: 160 }).line(narrow).render(), /numeric-axes-v1/);
  const samples = [
    ['pm-columns', figure({ width: 400, height: 300, theme: 'sage' }).bar(pm)],
    ['signed-stack', figure({ width: 400, height: 300, theme: 'azure' }).bar(signed)],
    ['decimal-bound-witness', figure({ width: 400, height: 250, theme: 'sage' }).scatter({ axes, unit: 'mol/L', xUnit: 's', points: [{ x: 0, y: 0.00003 }] })],
    ['scientific-scatter', figure({ width: 400, height: 250 }).scatter(scientific)],
    ['large-scatter-final', figure({ width: 400, height: 300, theme: 'stone-teal' }).scatter(large)],
    ['dark-cjk-line', figure({ width: 440, height: 300, theme: 'sage-dark' }).line(cjk)],
    ['narrow-thinned', figure({ width: minimumWidth, height: 160, theme: 'sage' }).line(narrow)],
  ];
  for (const [name, f] of samples) {
    const svg = f.render();
    const canvas = await raster(svg, name);
    measurements.push({ name, ...(name === 'scientific-scatter' ? { nativeRasterBackground: '#ffffff', svgRemainsTransparent: true } : {}), width: canvas.width, height: canvas.height, rgbaSha256: hash(region(canvas, 0, 0, canvas.width, canvas.height)) });
  }
  const full = samples.at(-1)[1].render();
  assert.equal((full.slice(full.indexOf('data-plot-axis="x"')).match(/data-plot-tick-value/g) ?? []).length, 2, 'narrow X thins to required endpoints');
  let rejected;
  try { figure({ width: 160, height: 120 }).scatter({ ...scientific, unit: 'very long full scientific quantity unit' }).render(); } catch (error) { rejected = error.message; }
  assert.match(rejected, /numeric-axes-v1 full ticks and units do not fit/);
  measurements.push({ minimumNarrowWidth: minimumWidth, height: 160, tooSmallFullUnitRejection: rejected });
});

test('fractional large-radius scatter never enters guide bands during motion', async () => {
  const f = figure({ width: 400, height: 300, theme: 'stone-teal', animated: true }).scatter(large);
  const plain = f.renderFrame(1600), final = await raster(plain);
  assert.equal(plain, figure({ width: 400, height: 300, theme: 'stone-teal' }).scatter(large).render());
  assert.equal(plain, f.renderFrame(0, { reducedMotion: true }));
  const yRule = Number(plain.match(/data-plot-axis="y"[\s\S]*?<line x1="([^"]+)"/)[1]);
  const xRule = Number(plain.match(/data-plot-axis="x"[\s\S]*?<line[^>]*y1="([^"]+)"/)[1]);
  const guideBands = [[0, 0, Math.floor(yRule), 300], [0, Math.ceil(xRule), 400, 300 - Math.ceil(xRule)], [0, 0, 400, 30]];
  for (const time of [0, 150]) {
    const svg = f.renderFrame(time), frame = await raster(svg, `large-scatter-${time}ms`);
    assert.notDeepEqual(region(frame, 0, 0, 400, 300), region(final, 0, 0, 400, 300));
    for (const band of guideBands) assert.deepEqual(region(frame, ...band), region(final, ...band));
  }
  measurements.push({ name: 'large-scatter-motion', guideBands, staticAcrossFrames: [0, 150, 1600], reducedEqualsFinal: true });
});

test('legacy and 14 themes × three surface policies rasterize all three quantitative families', async () => {
  let cases = 0;
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
    const options = { width: 440, height: 300, ...(theme ? { theme } : {}), surfacePolicy };
    for (const [kind, data] of [['bar', pm], ['line', cjk], ['scatter', scientific]]) {
      const svg = figure(options)[kind](data).render();
      const canvas = await raster(svg);
      assert.equal(canvas.width, 440); assert.equal(canvas.height, 300);
      const expectedInk = theme ? getCanonicalTheme(theme).tokens['--ink'] : '#051C2C';
      assert.ok(svg.slice(svg.indexOf('data-plot-axes')).includes(`fill="${expectedInk}"`));
      if (surfacePolicy === 'transparent-auto-v1') assert.equal(region(canvas, 439, 299, 1, 1)[3], 0, 'axes do not add a backing');
      cases++;
    }
  }
  assert.equal(cases, 135);
  measurements.push({ name: 'theme-surface-family-matrix', cases, retainedRasterFiles: 0 });
});

after(() => {
  if (!dir) return;
  let font;
  try { font = execFileSync('fc-match', ['sans-serif'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { font = 'fc-match unavailable'; }
  const manifest = JSON.stringify({ runtime: { node: process.version, rsvg: version, font }, bundleSha256: hash(readFileSync(new URL('../dist/svg.js', import.meta.url))),
    limitations: ['Native raster evidence, no browser playback', 'Estimated advance boxes; glyph coverage/readability and pixels vary with fonts/viewers'], artifacts, measurements }, null, 2) + '\n';
  assert.ok(evidenceBytes + Buffer.byteLength(manifest) < 2 * 1024 * 1024);
  writeFileSync(join(dir, 'evidence.json'), manifest);
});
