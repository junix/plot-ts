/** Native raster acceptance using an installed rsvg-convert, never a browser.
 * Build first. Set PLOT_TS_RSVG_CONVERT for a non-PATH native executable and
 * PLOT_TS_LEGEND_EVIDENCE_DIR to retain SVG/PNG evidence and hashes.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { figure, getCanonicalTheme } from '../dist/svg.js';

const rsvg = process.env.PLOT_TS_RSVG_CONVERT ?? 'rsvg-convert';
const version = execFileSync(rsvg, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
assert.match(version, /rsvg-convert version /, 'use the real native rasterizer');
const { createCanvas, loadImage } = createRequire(import.meta.url)('canvas');
const dir = process.env.PLOT_TS_LEGEND_EVIDENCE_DIR;
if (dir) mkdirSync(dir, { recursive: true });
const artifacts = [], measurements = [];
const hash = data => createHash('sha256').update(data).digest('hex');
function save(name, data) {
  if (!dir) return;
  writeFileSync(join(dir, name), data);
  artifacts.push({ name, bytes: Buffer.byteLength(data), sha256: hash(data) });
}
async function raster(name, svg) {
  const png = execFileSync(rsvg, ['--format=png'], { input: svg, timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  save(name + '.svg', svg); save(name + '.png', png);
  const image = await loadImage(png), canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}
const region = (canvas, x, y, w, h) => canvas.getContext('2d').getImageData(x, y, w, h).data;
const series = [
  { name: '实测 & <A>', values: [9, -6, 3] },
  { name: '预测 "B"', values: [-4, 3, 2] },
];

for (const stacked of [false, true]) test(`CJK ${stacked ? 'stacked' : 'grouped'} legends remain visible and pixel-static across frames`, async () => {
  const name = stacked ? 'stacked-cjk' : 'grouped-cjk';
  const f = figure({ width: 440, height: 290, theme: 'sage', animated: true })
    .bar({ categories: ['甲', '乙', '丙'], stacked, yAxis: true, legend: 'series-names-v1', series });
  const plain = f.renderFrame(1600), final = await raster(`${name}-final`, plain);
  const legendPixels = region(final, 0, 238, 440, 52);
  const reducedBody = await raster(`${name}-body-reference`, figure({ width: 440, height: 238, theme: 'sage' })
    .bar({ categories: ['甲', '乙', '丙'], stacked, yAxis: true, series }).render());
  assert.deepEqual(region(final, 0, 0, 440, 238), region(reducedBody, 0, 0, 440, 238), 'reserved body matches direct reduced-height pixels');
  assert.ok(new Set(Array.from(legendPixels)).size > 20, 'band contains rendered text and swatches');
  for (const time of [0, 150, 600]) {
    const frame = await raster(`${name}-${time}ms`, f.renderFrame(time));
    assert.deepEqual(region(frame, 0, 238, 440, 52), legendPixels);
    if (time === 0) assert.notDeepEqual(region(frame, 0, 0, 440, 238), region(final, 0, 0, 440, 238));
  }
  const reduced = await raster(`${name}-reduced`, f.renderFrame(0, { reducedMotion: true }));
  assert.deepEqual(region(reduced, 0, 0, 440, 290), region(final, 0, 0, 440, 290));
  measurements.push({ name, legendRgbaSha256: hash(legendPixels), staticAcrossFrames: [0, 150, 600, 1600], reducedEqualsFinal: true });
});

test('narrow CJK panel, nullable line/area, and titled independent panels render complete rows', async () => {
  const line = { x: [0, 1, 2, 3, 4, 5], legend: 'series-names-v1', series: [
    { name: '温度 & <实测>', y: [2, 5, null, -1, 3, 1], area: true },
    { name: '预测 "B"', y: [1, 3, 2, null, -2, 4] },
  ] };
  for (const [name, f, size] of [
    ['narrow-cjk', figure({ width: 160, height: 150, theme: 'sage' }).line(line), [160, 150]],
    ['nullable-line-area', figure({ width: 440, height: 290, theme: 'sage-dark' }).line(line), [440, 290]],
    ['titled-two-panel', figure({ width: 816, height: 340, title: '多系列 / Named series', columns: 2, theme: 'sage' })
      .bar({ categories: ['甲', '乙', '丙'], legend: 'series-names-v1', series }).line(line), [816, 340]],
  ]) {
    const svg = f.render(), canvas = await raster(name, svg);
    assert.deepEqual([canvas.width, canvas.height], size);
    assert.ok(svg.includes('lengthAdjust="spacingAndGlyphs"'));
    measurements.push({ name, width: canvas.width, height: canvas.height, rgbaSha256: hash(region(canvas, 0, 0, ...size)) });
  }
});

test('legacy opacity and transparent semantic swatches survive native rendering', async () => {
  const c = { categories: ['A'], labels: false, legend: 'series-names-v1', series: Array.from({ length: 4 }, (_, i) => ({ name: `S${i}`, values: [i + 1] })) };
  const f = figure({ width: 240, height: 260, surfacePolicy: 'transparent-auto-v1' }).bar(c);
  const canvas = await raster('legacy-column-opacity', f.render());
  const swatch = region(canvas, 12, 172 + 17 + 54, 1, 1);
  assert.ok(Math.abs(swatch[3] - 127.5) <= 1, `fourth series swatch alpha ${swatch[3]} should be half opaque`);
  const theme = getCanonicalTheme('sage-dark');
  const dark = await raster('transparent-canonical', figure({ width: 240, height: 260, theme: 'sage-dark', surfacePolicy: 'transparent-auto-v1' }).bar(c).render());
  assert.equal(region(dark, 230, 250, 1, 1)[3], 0, 'no automatic legend backing');
  const first = region(dark, 12, 189, 1, 1);
  assert.deepEqual(Array.from(first), [...[1, 3, 5].map(i => parseInt(theme.series[0].slice(i, i + 2), 16)), 255]);
  measurements.push({ name: 'legacy-column-opacity', fourthSwatchRgba: Array.from(swatch), transparentCanonicalFirstSwatchRgba: Array.from(first) });
});

after(() => {
  if (!dir) return;
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({
    runtime: { node: process.version, platform: process.platform, arch: process.arch, rsvg: version },
    bundle: { sha256: hash(readFileSync(new URL('../dist/svg.js', import.meta.url))) },
    limitations: ['Native raster acceptance only; no browser playback', 'System fonts unmeasured; no cross-platform glyph or pixel guarantee'],
    artifacts, measurements,
  }, null, 2) + '\n');
});
