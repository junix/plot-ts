import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES, type SvgFigureOptions } from '../src/svg/index.js';
import { generateStyles, palette, type AccentName } from '../src/style/tokens.js';
import { motionFixtures, fixtureOptions } from './fixtures/svg-motion.js';
import { checkStylesheet, parseDocument } from './helpers/html-document.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const golden = JSON.parse(readFileSync(new URL('./fixtures/svg-motion-static-golden.json', import.meta.url), 'utf8'));
const targets = (s: string) => [...s.matchAll(/<g data-plot-motion-target="(\d+)"([^>]*)>/g)];
const numbers = (s: string, property: string) => [...s.matchAll(new RegExp(`${property}:([\\d.]+)(?:ms|px)`, 'g'))].map(m => Number(m[1]));
function marks(s: string) {
  return [...s.matchAll(/<(?:rect|circle|line|path|polygon)\b[^>]*\/>|<text\b[^>]*>.*?<\/text>/gs)].map(m => m[0]
    .replace(/ class="plt-(?:grow|fade)"/g, '').replace(/ style="--i:[^"]*"/g, ''));
}

test('585 static baseline hashes and public legacy style bytes remain exact', () => {
  for (const theme of [undefined, ...CANONICAL_THEME_NAMES]) for (const surfacePolicy of SURFACE_POLICIES) {
    for (const [name, make] of motionFixtures) {
      const options = { ...fixtureOptions, ...(theme ? { theme } : {}), surfacePolicy };
      const plain = make(figure(options)).render();
      assert.equal(hash(plain), golden.hashes[[theme ?? 'legacy', surfacePolicy, name].join('/')]);
      assert.equal(make(figure({ ...options, animated: false })).render(), plain);
      const animated = make(figure({ ...options, animated: true }));
      assert.equal(animated.renderFrame(1600), plain);
      assert.equal(animated.renderFrame(0, { reducedMotion: true }), plain);
      assert.deepEqual(marks(animated.render()), marks(plain), `${theme}/${surfacePolicy}/${name}: final geometry, paints, text and order`);
      assert.deepEqual(marks(animated.renderHtml()), marks(plain));
    }
  }
  for (const [accent, expected] of Object.entries(golden.styles)) assert.equal(hash(generateStyles(palette(accent as AccentName))), expected);
});

test('omitted/false/true choose documented SVG and HTML entry behavior', () => {
  const make = (animated?: boolean) => figure({ ...(animated === undefined ? {} : { animated }) }).bar({ categories: ['A'], series: [{ values: [2] }] });
  const plain = make().render();
  assert.doesNotMatch(plain, /data-plot-motion|<style/);
  assert.equal(make(false).render(), plain);
  assert.match(make().renderHtml(), /plot-ts-svg-entry-v1-grow/);
  assert.match(make(true).render(), /<style>.*?data-plot-motion/s);
  assert.ok(make(false).renderHtml().includes(plain));
  assert.doesNotMatch(make(false).renderHtml(), /@keyframes|animation:|animation-name:|data-plot-motion/);
  for (const mode of [undefined, false, true]) checkStylesheet(make(mode).renderHtml());
  assert.equal(targets(make(true).render()).length, 2, 'one mark and one emitted value label');
});

test('signed stacks grow as one category group around the serialized zero; labels only fade', () => {
  const f = figure({ animated: true, width: 310.007, height: 201.009 }).bar({ categories: ['A', 'B'], stacked: true,
    series: [{ values: [7, -8] }, { values: [-4, 3] }, { values: [2, -1] }] });
  const source = f.render(), baseline = /<line[^>]*y1="([^"]+)"[^>]*y2="\1"/.exec(source)![1];
  const grows = [...source.matchAll(/<g data-plot-motion-target="\d+" data-plot-motion-kind="grow"[^>]*>(.*?)<\/g>/g)];
  assert.equal(grows.length, 2);
  for (const g of grows) {
    assert.equal((g[1]!.match(/<rect /g) ?? []).length, 3);
    assert.doesNotMatch(g[1]!, /<text/);
    assert.ok(g[0].includes(`--plot-ts-entry-origin:${baseline}px`));
  }
  for (const g of source.matchAll(/<g data-plot-motion-target="\d+" data-plot-motion-kind="fade"[^>]*>(.*?)<\/g>/g)) {
    assert.match(g[1]!, /^<text/); assert.match(g[0], /--plot-ts-entry-rise:0px/);
  }
  assert.equal(targets(f.renderFrame(0)).filter(t => t[2]!.includes('scale(1 0)')).length, 2);
  assert.deepEqual(marks(f.renderFrame(200)), marks(f.renderFrame(1600)));
});

test('off-panel accepted zero uses fade, while zero/minimum-height marks keep their geometry', () => {
  const f = figure({ animated: true }).bar({ categories: ['negative'], series: [{ values: [-10] }], max: -5 });
  assert.ok(targets(f.render()).every(m => m[2]!.includes('kind="fade"')));
  const zero = figure({ animated: true }).bar({ categories: ['zero'], series: [{ values: [0] }] });
  assert.equal(targets(zero.render()).length, 1);
  assert.match(zero.render(), /height="0.5"/);
  assert.deepEqual(marks(zero.renderFrame(0)), marks(zero.renderFrame(1600)));
});

test('scatter wrappers keep child 0.7 alpha and floor exact emitted bottom slack', () => {
  const cases = [[100.006, 24], [100.009, 35.555], [71, 35], [100, 4]];
  for (const [height, size] of cases) {
    const f = figure({ animated: true, width: 180, height }).scatter({ points: [{ x: 0, y: 0, size }, { x: 1, y: 1, size }] });
    const active = f.render(), rises = numbers(active, '--plot-ts-entry-rise');
    const circles = [...active.matchAll(/<circle[^>]*cy="([^"]+)" r="([^"]+)"[^>]*opacity="0.7"/g)];
    assert.equal(circles.length, 2);
    circles.forEach((circle, i) => {
      assert.ok(rises[i]! >= 0 && rises[i]! <= 8);
      assert.ok(Number(circle[1]) + Number(circle[2]) + rises[i]! <= height! + 1e-12);
      assert.doesNotMatch(circle[0], /plt-fade|--i:/);
    });
    assert.equal(rises[0], Math.min(8, Math.floor((height! - Number(circles[0]![1]) - Number(circles[0]![2]) + 1e-10) * 100) / 100));
  }
});

test('rendered order controls compressed schedule across panels, not source indexes', () => {
  const points = Array.from({ length: 3000 }, () => ({ x: NaN, y: 3 }));
  points.push({ x: 0, y: 0 }, { x: 1, y: 1 });
  const f = figure({ animated: true, width: 500, columns: 2 }).scatter({ points }).bar({ categories: ['skip', 'mark'], labels: false, series: [{ values: [null, 2] }] });
  assert.deepEqual(targets(f.render()).map(m => Number(m[1])), [0, 1, 2]);
  assert.deepEqual(numbers(f.render(), '--plot-ts-entry-delay'), [0, 55, 110]);
  const dense = figure({ animated: true }).scatter({ points: Array.from({ length: 2048 }, (_, i) => ({ x: i, y: i % 3, size: 0 })) });
  const delays = numbers(dense.render(), '--plot-ts-entry-delay');
  assert.equal(delays.length, 2048); assert.equal(delays[0], 0);
  assert.ok(delays.every((d, i) => d >= 0 && d + 440 <= 1600 && (i === 0 || d >= delays[i - 1]!)));
  const labels = figure({ animated: true }).bar({ categories: Array.from({ length: 1024 }, (_, i) => String(i)), series: [{ values: Array(1024).fill(2) }] });
  assert.equal(targets(labels.render()).length, 2048, 'labels participate in the cap');
});

test('2049 explicit targets reject; implicit HTML falls back wholly static, never drops data', () => {
  const config = { points: Array.from({ length: 2049 }, (_, i) => ({ x: i, y: i % 3, size: 0 })) };
  const plain = figure().scatter(config), explicit = figure({ animated: true }).scatter(config);
  for (const fn of [() => explicit.render(), () => explicit.renderHtml(), () => explicit.renderFrame(0), () => plain.renderFrame(0)]) assert.throws(fn, /2048 rendered targets/);
  const html = plain.renderHtml();
  assert.ok(html.includes(plain.render()));
  assert.doesNotMatch(html, /data-plot-motion|@keyframes|animation-name/);
  assert.equal((html.match(/<circle /g) ?? []).length, 2049);
  assert.equal(explicit.renderFrame(1600), plain.render());
  assert.equal(explicit.renderFrame(0, { reducedMotion: true }), plain.render());
  assert.equal(figure({ animated: false }).scatter(config).renderFrame(1), plain.render());
});

test('pure snapshots support reset, interruption, seeking and exact completion without hidden state', () => {
  const make = () => figure({ animated: true }).scatter({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  const f = make(), start = f.renderFrame(0), middle = f.renderFrame(180), last = f.renderFrame(355);
  assert.notEqual(start, middle); assert.notEqual(middle, last);
  for (const time of [180, 10, 354.999, 0, 355, 55, 54.999, 1600, 180]) assert.equal(f.renderFrame(time), make().renderFrame(time));
  assert.equal(f.renderFrame(54.999).match(/target="1"[^>]*opacity="([^"]+)"/)![1], '0');
  assert.equal(f.renderFrame(55).match(/target="1"[^>]*opacity="([^"]+)"/)![1], '0');
  assert.equal(last, f.renderFrame(1600));
  assert.doesNotMatch(last, /data-plot-motion/);
  assert.doesNotMatch(middle, /<style|animation|data-plot-motion-playback/);
  for (const m of middle.matchAll(/opacity="([^"]+)"/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 1);
});

test('versioned CSS is scoped, delayed targets use both fill, and nested static/frame figures are not playback targets', () => {
  const make = () => figure({ animated: true, title: '</style><script>attack</script>' }).scatter({ points: [{ x: 0, y: 0 }] });
  const a = make().render(), b = make().render(); assert.equal(a, b);
  const css = /<style>(.*?)<\/style>/s.exec(a)![1]!;
  assert.deepEqual(transformSync(css, { loader: 'css', logLevel: 'silent' }).warnings, []);
  assert.match(css, /animation-fill-mode: both/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important; opacity: 1 !important; transform: none !important/);
  assert.match(css, /\[data-plot-motion="entry-v1"\] \[data-plot-motion-target\]\[data-plot-motion-playback="entry-v1"\]/);
  assert.doesNotMatch(a, /class="plt-(?:fade|grow)"|<script| id=/);
  const nestedFrame = make().renderFrame(100), nestedStatic = figure({ animated: false }).scatter({ points: [{ x: 0, y: 0 }] }).render();
  assert.doesNotMatch(nestedFrame + nestedStatic, /data-plot-motion-playback/);
  assert.equal(targets(a + b).length, 2);
  parseDocument(`<div>${a}${b}${nestedFrame}${nestedStatic}</div>`);
});

test('time, boolean and source validation also apply on static shortcuts; failed calls do not mutate', () => {
  const f = figure().scatter({ points: [{ x: 0, y: 0 }] }), before = f.render();
  for (const t of [-1, NaN, Infinity, -Infinity, '0', null]) assert.throws(() => f.renderFrame(t as number), /frame time/);
  for (const opt of [null, [], false, { reducedMotion: null }, { reducedMotion: 1 }]) assert.throws(() => f.renderFrame(1600, opt as any), /reducedMotion/);
  for (const animated of [null, 0, 'true']) assert.throws(() => figure({ animated } as unknown as SvgFigureOptions), /animated/);
  assert.equal(f.render(), before);
  for (const opts of [{}, { reducedMotion: true }]) {
    assert.throws(() => figure().scatter({ points: [{ x: 0, y: 0, size: -1 }] }).renderFrame(1600, opts), /size/);
    assert.throws(() => figure().heatmap({ data: [[NaN]] }).renderFrame(0, opts), /finite/);
  }
  assert.equal(figure({ animated: true }).renderFrame(0), figure().render());
});
