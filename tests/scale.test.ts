import assert from 'node:assert/strict';
import test from 'node:test';
import { linear, niceCeil, niceFloor, ticks, sum, maxOf, minOf, fmt } from '../src/util/scale.js';

test('linear supports reversed ranges and degenerate domains', () => {
  assert.equal(linear(5, 0, 10, 100, 0), 50);
  assert.equal(linear(5, 5, 5, 10, 20), 10);
});

test('nice bounds cover their input without adding the opposite sign', () => {
  assert.equal(niceCeil(28.7), 30);
  assert.equal(niceFloor(-28.7), -30);
  assert.equal(niceCeil(-1), 0);
  assert.equal(niceFloor(1), 0);
});

test('ticks include both endpoints', () => {
  assert.deepEqual(ticks(0, 100, 4), [0, 25, 50, 75, 100]);
});

test('finite reducers skip missing and non-finite samples', () => {
  const values = [null, NaN, Infinity, -Infinity, 3, -2];
  assert.equal(sum(values), 1);
  assert.equal(maxOf(values), 3);
  assert.equal(minOf(values), -2);
  assert.equal(maxOf([null]), 0);
  assert.equal(minOf([]), 0);
});

test('plain formatting retains significant digits and handles missing data', () => {
  assert.equal(fmt(1234.5), '1,234.5');
  assert.equal(fmt(10), '10');
  assert.equal(fmt(3.5, 'plain', 2), '3.50');
  assert.equal(fmt(null), '');
  assert.equal(fmt(NaN), '');
});
