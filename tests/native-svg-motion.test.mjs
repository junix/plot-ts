/** Deterministic native frame acceptance. This does not execute browser CSS.
 * Build first, then node --test --test-concurrency=1 tests/native-svg-motion.test.mjs
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { figure } from '../dist/svg.js';

const require = createRequire(import.meta.url), canvas = require('canvas');
const { createCanvas, loadImage } = canvas;
const dir = process.env.PLOT_TS_MOTION_EVIDENCE_DIR;
if (dir) mkdirSync(dir, { recursive: true });
const artifacts = [], measurements = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function save(name, bytes) {
  if (!dir) return;
  writeFileSync(join(dir, name), bytes);
  artifacts.push({ name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
}
async function decode(svg) {
  const image = await loadImage(Buffer.from(svg)), surface = createCanvas(image.width, image.height);
  surface.getContext('2d').drawImage(image, 0, 0);
  return surface;
}
const pixels = surface => surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data;
const corners = size => [{ x: -2, y: -2, size }, { x: 2, y: -2, size }, { x: -2, y: 2, size }, { x: 2, y: 2, size }];
const configs = [
  ['grouped-signed', f => f.bar({ categories: ['A', 'B'], series: [{ values: [9, -6] }, { values: [3, -2] }] })],
  ['stacked-signed', f => f.bar({ categories: ['A', 'B'], stacked: true, series: [{ values: [9, -6] }, { values: [-4, 3] }, { values: [3, -2] }] })],
  ['scatter-edge', f => f.scatter({ points: corners(24) })],
  ['scatter-fractional-radius', f => f.scatter({ points: corners(35.555) })],
];

for (const theme of [undefined, 'sage', 'sage-dark']) for (const [kind, add] of configs) {
  test(`${theme ?? 'legacy'}/${kind}: real stage PNGs, repeated seek and exact static final`, async () => {
    const options = { width: 300, height: 220, theme, surfacePolicy: 'transparent-auto-v1' };
    const active = add(figure({ ...options, animated: true })), plain = add(figure({ ...options, animated: false })).render();
    const final = await decode(plain), finalPixels = pixels(final);
    const finalHash = hash(finalPixels);
    const seen = new Set();
    for (const time of [0, 150, 350, 800, 1600, 150, 0]) {
      const svg = active.renderFrame(time), surface = await decode(svg), bytes = pixels(surface);
      const name = `${theme ?? 'legacy'}-${kind}-${time}ms`;
      assert.equal(surface.width, 300); assert.equal(surface.height, 220);
      if (time === 1600) {
        assert.equal(svg, plain); assert.deepEqual(bytes, finalPixels);
      }
      if (!seen.has(time)) {
        save(name + '.svg', svg); save(name + '.png', surface.toBuffer('image/png'));
        measurements.push({ name, timeMs: time, rgbaSha256: hash(bytes), finalRgbaSha256: finalHash });
        seen.add(time);
      } else {
        assert.equal(hash(bytes), measurements.find(m => m.name === name).rgbaSha256, 'reset and backward seek reproduce pixels');
      }
      if (kind.startsWith('scatter') && time === 0) assert.ok([...bytes].every((v, i) => i % 4 !== 3 || v === 0));
      if (time === 150) assert.notEqual(hash(bytes), finalHash, 'intermediate raster is observably different');
    }
    const reduced = active.renderFrame(0, { reducedMotion: true });
    assert.equal(reduced, plain); assert.deepEqual(pixels(await decode(reduced)), finalPixels);
    save(`${theme ?? 'legacy'}-${kind}-reduced.svg`, reduced);
    save(`${theme ?? 'legacy'}-${kind}-reduced.png`, (await decode(reduced)).toBuffer('image/png'));
    // Native SVG's no-CSS-playback path must expose final geometry, not a hidden
    // opacity:0 base state. This is explicitly not proof of browser playback.
    assert.deepEqual(pixels(await decode(active.render())), finalPixels);
    save(`${theme ?? 'legacy'}-${kind}-animated.svg`, active.render());
    save(`${theme ?? 'legacy'}-${kind}-animated.html`, active.renderHtml());
  });
}

test('scatter wrapper opacity multiplies the preserved 0.7 child alpha', async () => {
  const f = figure({ width: 100, height: 100, animated: true }).scatter({ points: [{ x: 0, y: 0, size: 24 }] });
  for (const time of [0, 40, 150, 299]) {
    const frame = f.renderFrame(time), opacity = Number(/kind="fade"[^>]*opacity="([^"]+)"/.exec(frame)[1]);
    const surface = await decode(frame), data = pixels(surface);
    let maxAlpha = 0; for (let i = 3; i < data.length; i += 4) maxAlpha = Math.max(maxAlpha, data[i]);
    assert.ok(Math.abs(maxAlpha - 255 * 0.7 * opacity) <= 2, `${time}ms alpha ${maxAlpha} differs from ${255 * 0.7 * opacity}`);
    assert.ok(maxAlpha <= 179, 'fade must not override child opacity to one');
    measurements.push({ name: 'alpha-witness', timeMs: time, opacity, maxAlpha });
  }
});

test('unclipped scatter frame reference proves integer/fractional panel containment and clear translated gaps', async () => {
  const reports = [
    ['integer', figure({ width: 336, height: 160, title: 'Panels', columns: 2, animated: true, surfacePolicy: 'transparent-auto-v1' }).scatter({ points: corners(35) }).scatter({ points: corners(35) })],
    ['fractional', figure({ width: 336.012, height: 296.012, title: 'Panels', columns: 2, animated: true, surfacePolicy: 'transparent-auto-v1' }).scatter({ points: corners(24) }).scatter({ points: corners(24) }).scatter({ points: corners(35.555) }).scatter({ points: corners(35.555) })],
  ];
  for (const [name, report] of reports) for (const time of [0, 80, 150, 350, 800, 1600]) for (const scale of [1, 2]) {
    const svg = report.renderFrame(time), content = svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>$/, '');
    const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${400 * scale}" height="${360 * scale}" viewBox="0 0 400 360"><g transform="translate(16,16)">${body}</g></svg>`;
    const clipped = wrap(content), reference = wrap(content.replace(/<svg\b[^>]*>(.*?)<\/svg>/g, '<g>$1</g>'));
    const a = await decode(clipped), b = await decode(reference), actual = pixels(a), expected = pixels(b);
    let maxAlphaDifference = 0, lost = 0;
    const alpha2Pixels = [];
    for (let i = 3; i < actual.length; i += 4) {
      const difference = Math.abs(actual[i] - expected[i]); maxAlphaDifference = Math.max(maxAlphaDifference, difference);
      if (difference > 1) alpha2Pixels.push({ x: ((i - 3) / 4) % a.width, y: Math.floor(((i - 3) / 4) / a.width), actual: actual[i], expected: expected[i] });
      if (expected[i] > 1 && actual[i] === 0) lost++;
    }
    assert.equal(lost, 0, `${name}/${time}ms/${scale}x: visible reference ink lost to clipping`);
    // Fractional viewport clipping plus group-opacity compositing can round
    // twice: the 800ms/2x witness differs by two alpha levels at two left-edge
    // pixels. Flattening opacity into the circle returns the original alpha1
    // bound. Geometry and visible ink remain contained; never relax integer or
    // static fractional gates. The forced-rise negative control below must fail.
    const groupFade = svg.includes('data-plot-motion="frame-v1"');
    const allowance = name === 'fractional' ? (groupFade ? 2 : 1) : 0;
    assert.ok(maxAlphaDifference <= allowance, `${name}/${time}ms/${scale}x exceeds native compositing allowance`);
    if (maxAlphaDifference > 1) {
      save(`${name}-alpha2-${time}ms-${scale}x-reference.svg`, reference);
      save(`${name}-alpha2-${time}ms-${scale}x-reference.png`, b.toBuffer('image/png'));
      // The isolated group-alpha probe uses exactly the same emitted circles.
      const flattened = content.replace(/(<g data-plot-motion-target[^>]*?) opacity="([^"]+)"(><circle[^>]*?)opacity="0.7"/g,
        (_match, group, opacity, circle) => `${group}${circle}opacity="${Number(opacity) * 0.7}"`);
      const fa = pixels(await decode(wrap(flattened)));
      const fb = pixels(await decode(wrap(flattened.replace(/<svg\b[^>]*>(.*?)<\/svg>/g, '<g>$1</g>'))));
      for (let i = 3; i < fa.length; i += 4) assert.ok(Math.abs(fa[i] - fb[i]) <= 1, 'without group compositing, fractional alpha1 remains enough');
    }
    const gap = a.getContext('2d').getImageData(177 * scale, 60 * scale, 14 * scale, 80 * scale).data;
    assert.ok([...gap].every((v, i) => i % 4 !== 3 || v === 0), 'translated inter-panel gap stays transparent');
    measurements.push({ name, timeMs: time, scale, lost, maxAlphaDifference, alpha2Pixels });
    save(`${name}-containment-${time}ms-${scale}x.svg`, clipped);
    save(`${name}-containment-${time}ms-${scale}x.png`, a.toBuffer('image/png'));
  }
});

test('unsafe scatter motion is detected despite the narrow fractional alpha allowance', async () => {
  const f = figure({ width: 336.012, height: 160.006, title: 'Panels', columns: 2, animated: true })
    .scatter({ points: corners(35.555) }).scatter({ points: corners(35.555) });
  const safe = f.renderFrame(250);
  const unsafe = safe.replace(/(data-plot-motion-kind="fade" transform=")translate\(0 [^)]+\)/g, '$1translate(0 8)');
  const content = unsafe.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>$/, '');
  const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="440" viewBox="0 0 400 220"><g transform="translate(16,16)">${body}</g></svg>`;
  const a = await decode(wrap(content)), b = await decode(wrap(content.replace(/<svg\b[^>]*>(.*?)<\/svg>/g, '<g>$1</g>')));
  const actual = pixels(a), expected = pixels(b);
  let maxAlphaDifference = 0, lost = 0;
  for (let i = 3; i < actual.length; i += 4) {
    maxAlphaDifference = Math.max(maxAlphaDifference, Math.abs(actual[i] - expected[i]));
    if (expected[i] > 1 && actual[i] === 0) lost++;
  }
  assert.ok(maxAlphaDifference > 2 && lost > 0, 'real motion clipping exceeds the allowance and loses visible ink');
  measurements.push({ name: 'unsafe-rise-negative-control', maxAlphaDifference, lost });
  save('unsafe-rise-negative-control.svg', wrap(content));
  save('unsafe-rise-negative-control.png', a.toBuffer('image/png'));
  save('unsafe-rise-negative-control-reference.png', b.toBuffer('image/png'));
});

after(() => {
  save('measurements.json', JSON.stringify({
    browserAcceptance: false,
    nativeOnly: 'Deterministic frame geometry/alpha and CSS-free raster decoding; no live CSS playback, prefers-reduced-motion or DOM events.',
    versions: { node: process.version, platform: process.platform, arch: process.arch, canvas: canvas.version, rsvg: canvas.rsvgVersion, cairo: canvas.cairoVersion },
    bundles: ['dist/svg.js', 'dist/plot-ts.js'].map(path => ({ path, sha256: hash(readFileSync(path)) })),
    nativeBinding: { path: 'node_modules/canvas/build/Release/canvas.node', sha256: hash(readFileSync('node_modules/canvas/build/Release/canvas.node')) }, measurements,
  }, null, 2) + '\n');
  save('artifact-manifest.json', JSON.stringify({ artifacts }, null, 2) + '\n');
});
