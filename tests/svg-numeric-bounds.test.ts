import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { numericNiceCeil, numericNiceCeilForAxis } from '../src/svg/numeric-bounds.js';
import { figure } from '../src/svg/index.js';

const axes = 'numeric-axes-v1' as const;
const view = new DataView(new ArrayBuffer(8));
function adjacentPositive(value: number, up: boolean): number {
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + (up ? 1n : -1n));
  return view.getFloat64(0);
}
const steps = [[1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], [1, 1.2, 2, 2.4, 3.2, 4, 5, 6, 8, 10]];
// Independent reference: search the complete finite decimal ladder, without
// deriving an exponent from the input or reproducing the production loop.
const ladders = steps.map(ss => [...new Set(Array.from({ length: 633 }, (_, i) => i - 324)
  .flatMap(e => ss.map(s => Number(`${s}e${e}`))).filter(v => v > 0 && Number.isFinite(v)))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0));
function expected(value: number, axis: boolean): number | undefined {
  const ladder = ladders[axis ? 1 : 0]!;
  let low = 0, high = ladder.length;
  while (low < high) { const mid = (low + high) >>> 1; if (ladder[mid]! < value) low = mid + 1; else high = mid; }
  return ladder[low];
}
function domain(svg: string): [number, number] {
  const match = svg.match(/data-plot-axis="y" data-domain-min="([^"]+)" data-domain-max="([^"]+)"/);
  assert.ok(match); return [Number(match[1]), Number(match[2])];
}
function assertFullTicks(svg: string): void {
  for (const match of svg.matchAll(/data-plot-tick-value="([^"]+)"[\s\S]*?<text[^>]*>([^<]+)<\/text>/g)) {
    assert.equal(Number(match[2]!.replaceAll(',', '')), Number(match[1]));
  }
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
}

test('decimal niceness contains 93,062 boundary and seeded IEEE-754 values', () => {
  const digest = createHash('sha256'); let cases = 0, rejects = 0;
  const check = (value: number, axis: boolean) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const reference = expected(value, axis); let result: number | string;
    if (reference === undefined) { assert.throws(() => (axis ? numericNiceCeilForAxis : numericNiceCeil)(value), /finite outward decimal bound/); rejects++; result = 'reject'; }
    else {
      result = (axis ? numericNiceCeilForAxis : numericNiceCeil)(value); assert.equal(result, reference, `${value}/${axis}`);
      assert.ok(Number.isFinite(result) && result >= value);
    }
    digest.update(JSON.stringify([value, axis, result]) + '\n'); cases++;
  };
  for (let e = -324; e <= 308; e++) for (const s of [1, 1.2, 1.25, 1.5, 2, 2.4, 2.5, 3, 3.2, 4, 5, 6, 8, 10]) {
    const value = Number(`${s}e${e}`);
    if (value > 0 && Number.isFinite(value)) for (const v of [adjacentPositive(value, false), value, adjacentPositive(value, true)]) for (const axis of [false, true]) check(v, axis);
  }
  let bits = 0x123456789abcdefn; const mask = (1n << 64n) - 1n;
  for (let i = 0; i < 20000; i++) {
    bits ^= bits << 13n; bits ^= bits >> 7n; bits ^= bits << 17n; bits &= mask;
    view.setBigUint64(0, bits & ((1n << 63n) - 1n));
    const value = view.getFloat64(0); for (const axis of [false, true]) check(value, axis);
  }
  for (const axis of [false, true]) for (const value of [Number.MIN_VALUE, Number.MAX_VALUE, 0.00003, 0.00019, adjacentPositive(3, false), 3, adjacentPositive(3, true), 0.1 + 0.2]) check(value, axis);
  assert.equal(cases, 93062); assert.equal(rejects, 17);
  assert.equal(digest.digest('hex'), '822d1ce3d667399b4ea3b2c170b3964eff9db383d8cd63c7ab68fe03c4a24df3');
  for (const value of [-1, -Number.MIN_VALUE, -0, 0]) assert.equal(numericNiceCeil(value), 0);
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => numericNiceCeil(value), RangeError);
});

test('decimal scatter witness, adjacent steps and subnormals render their actual domain', () => {
  for (const value of [0.00003, adjacentPositive(0.00003, false), adjacentPositive(0.00003, true), Number.MIN_VALUE, 2 * Number.MIN_VALUE, 1e308]) {
    const svg = figure({ width: 800, height: 300 }).scatter({ axes, points: [{ x: 0, y: value }] }).render();
    assert.deepEqual(domain(svg), [value, expected(value, false)]); assertFullTicks(svg);
  }
  const witness = figure().scatter({ axes, points: [{ x: 0, y: 0.00003 }] }).render();
  assert.deepEqual(domain(witness), [0.00003, 0.00003]);
  assert.match(witness, />0\.00003<\/text>/);
  assert.throws(() => figure().scatter({ axes, points: [{ x: 0, y: Number.MAX_VALUE }] }).render(), /finite outward decimal bound/);
});

test('column and line inferred bounds mirror outward selection for both signs', () => {
  for (const magnitude of [0.00003, 0.1 + 0.2, adjacentPositive(1.2, false), 1.2, adjacentPositive(1.2, true), 3.2, adjacentPositive(3.2, true), 30000.000000000004]) {
    for (const sign of [-1, 1]) {
      const value = sign * magnitude;
      const column = figure({ width: 900, height: 400 }).bar({ axes, categories: ['A'], series: [{ values: [value] }], labels: false }).render();
      assert.deepEqual(domain(column), sign < 0 ? [-expected(magnitude, false)!, 0] : [0, expected(magnitude, true)]); assertFullTicks(column);
      if (sign < 0 && (magnitude < 0.001 || magnitude > 100)) continue; // Existing zero/endpoint fit rejection remains.
      const line = figure({ width: 900, height: 400 }).line({ axes, x: [0], series: [{ y: [value] }] }).render();
      assert.deepEqual(domain(line), sign < 0 ? [-expected(magnitude, true)!, 1] : [0, Math.max(expected(magnitude, false)!, 1)]); assertFullTicks(line);
    }
  }
  const value = Number.MIN_VALUE;
  const tiny = figure().bar({ axes, categories: ['A'], series: [{ values: [value] }], labels: false }).render();
  assert.deepEqual(domain(tiny), [0, value]); assertFullTicks(tiny);
});

test('signed stack extrema use actual sums, explicit maxima stay exact and legacy remains separate', () => {
  for (const magnitude of [0.000015, 0.15, 0.6, 1.6, 15000.000000000002]) {
    const stack = figure({ width: 900, height: 400 }).bar({ axes, stacked: true, categories: ['A'], labels: false,
      series: [magnitude, -magnitude, magnitude, -magnitude].map(value => ({ values: [value] })) }).render();
    assert.deepEqual(domain(stack), [-expected(2 * magnitude, false)!, expected(2 * magnitude, true)]); assertFullTicks(stack);
  }
  const value = adjacentPositive(1.2, true);
  for (const kind of ['bar', 'line'] as const) {
    const chart = kind === 'bar' ? { categories: ['A'], series: [{ values: [value] }], labels: false } : { x: [0], series: [{ y: [value] }] };
    const render = (max: number, profile = true) => (figure({ width: 900, height: 400 })[kind] as any)({ ...chart, ...(profile ? { axes } : {}), max }).render();
    assert.equal(domain(render(value))[1], value);
    assert.throws(() => render(1.2), /contain every rendered value/);
    assert.doesNotThrow(() => render(1.2, false));
  }
  // This is a niceness repair, not exact-real stack arithmetic. The existing
  // reverse positive stack can still expose a negative rounding residual.
  assert.throws(() => figure().bar({ axes, categories: ['A'], stacked: true, labels: false, series: [0.3, 0.6].map(v => ({ values: [v] })) }).render(), /contain every rendered value/);
});
