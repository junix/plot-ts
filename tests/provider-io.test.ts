import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { publishPair, readRegular } from '../src/provider/io.js';
function setup(t: test.TestContext) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'plot-provider-io-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = join(dir, 'input.json'), output = join(dir, 'figure.svg'), receipt = join(dir, 'receipt.json');
  fs.writeFileSync(input, '{}'); fs.writeFileSync(output, 'OLD-SVG', { mode: 0o640 }); fs.writeFileSync(receipt, 'OLD-RECEIPT', { mode: 0o604 });
  return { dir, input, output, receipt, captured: readRegular(input, 4194304) };
}
const svg = Buffer.from('<svg/>'), json = Buffer.from('{}\n');
test('ordinary pair publication preserves modes and exact bytes', t => {
  const s = setup(t); publishPair(s.captured, s.output, s.receipt, svg, json);
  assert.deepEqual(fs.readFileSync(s.output), svg); assert.deepEqual(fs.readFileSync(s.receipt), json);
  assert.equal(fs.statSync(s.output).mode & 0o777, 0o640); assert.equal(fs.statSync(s.receipt).mode & 0o777, 0o604);
  assert.equal(fs.readdirSync(s.dir).length, 3);
});
for (const kind of ['input-bytes', 'input-replace', 'stage-bytes', 'stage-symlink', 'second-rename'] as const) test(`no publication on ${kind}`, t => {
  const s = setup(t);
  assert.throws(() => publishPair(s.captured, s.output, s.receipt, svg, json, {
    afterStages: stages => {
      if (kind === 'input-bytes') fs.writeFileSync(s.input, '{"changed":1}');
      if (kind === 'input-replace') { fs.renameSync(s.input, s.input + '.old'); fs.writeFileSync(s.input, '{}'); }
      if (kind === 'stage-bytes') fs.writeFileSync(stages[0]!, 'changed');
      if (kind === 'stage-symlink') { fs.unlinkSync(stages[0]!); fs.symlinkSync(s.input, stages[0]!); }
    }, beforeRename: i => { if (kind === 'second-rename' && i === 1) throw new Error('injected normal failure'); },
  }));
  assert.equal(fs.readFileSync(s.output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(s.receipt, 'utf8'), 'OLD-RECEIPT');
  assert.ok(!fs.readdirSync(s.dir).some(n => n.startsWith('.plot-ts-')));
});
test('reject input/output aliases, symlink or hardlinked outputs and missing parents', t => {
  const s = setup(t);
  for (const [a, b] of [[s.input, s.receipt], [s.output, s.output], [join(s.dir, 'absent/figure.svg'), s.receipt]]) assert.throws(() => publishPair(s.captured, a!, b!, svg, json));
  const symlink = join(s.dir, 'link.svg'), hardlink = join(s.dir, 'hard.svg'); fs.symlinkSync(s.output, symlink); fs.linkSync(s.output, hardlink);
  for (const out of [symlink, hardlink, s.output]) assert.throws(() => publishPair(s.captured, out, s.receipt, svg, json));
});
test('native symlink/../ input semantics and explicit regular symlink accepted', t => {
  const s = setup(t); fs.mkdirSync(join(s.dir, 'real')); fs.mkdirSync(join(s.dir, 'real/child'));
  fs.writeFileSync(join(s.dir, 'real/input.json'), 'native'); fs.symlinkSync(join(s.dir, 'real/child'), join(s.dir, 'link'));
  assert.equal(readRegular(join(s.dir, 'link') + '/../input.json', 100).bytes.toString(), 'native');
  fs.symlinkSync(s.input, join(s.dir, 'input-link')); assert.equal(readRegular(join(s.dir, 'input-link'), 100).bytes.toString(), '{}');
});
test('reject oversized ordinary input and output without publication', t => {
  const s = setup(t); fs.truncateSync(s.input, 4194305); assert.throws(() => readRegular(s.input, 4194304));
  fs.writeFileSync(s.input, '{}'); const captured = readRegular(s.input, 4194304);
  fs.truncateSync(s.receipt, 262145); assert.throws(() => publishPair(captured, s.output, s.receipt, svg, json));
  assert.equal(fs.readFileSync(s.output, 'utf8'), 'OLD-SVG'); assert.equal(fs.statSync(s.receipt).size, 262145);
});

test('growing input and swapped FIFO fail in bounded read before any publication', t => {
  const s = setup(t); let grew = false;
  assert.throws(() => readRegular(s.input, 20, false, { afterChunk: () => { if (!grew) { grew = true; fs.appendFileSync(s.input, 'x'.repeat(30)); } } }));
  assert.throws(() => readRegular(s.input, 100, false, { afterResolved: () => { fs.renameSync(s.input, s.input + '.old'); execFileSync('mkfifo', [s.input]); } }));
  assert.equal(fs.readFileSync(s.output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(s.receipt, 'utf8'), 'OLD-RECEIPT');
});
test('read-only old destinations are not replaced through directory permissions', t => {
  const s = setup(t); fs.chmodSync(s.output, 0o444);
  assert.throws(() => publishPair(s.captured, s.output, s.receipt, svg, json));
  assert.equal(fs.readFileSync(s.output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(s.receipt, 'utf8'), 'OLD-RECEIPT');
});
