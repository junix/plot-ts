import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readRegular, publishPair } from '../src/provider/io.js';
import { validateInput, renderInput } from '../src/provider/input.js';
import { validateInputV2, renderInputV2 } from '../src/provider/input-v2.js';
import { validateFrameInput, renderFrameInput } from '../src/provider/input-frame.js';
import { makeFrameReceipt } from '../src/provider/receipt-frame.js';
import { makeReceipt } from '../src/provider/receipt.js';
import { makeReceiptV2 } from '../src/provider/receipt-v2.js';
for (const version of [1, 2, 3]) for (const fault of ['none', 'input-bytes', 'input-replace', 'stage-bytes', 'stage-symlink', 'second-rename']) {
  test(`V${version} real rendered pair retains publication guarantees for ${fault}`, t => {
    const dir = fs.mkdtempSync(join(tmpdir(), 'plot-provider-profile-io-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const inputPath = join(dir, 'input.json'), output = join(dir, 'figure.svg'), receipt = join(dir, 'receipt.json');
    const value = { schema_version: version === 3 ? 'plot-ts.svg-frame/v1' : `plot-ts.svg-figure/v${version}`, ...(version === 3 ? { frame: { profile: 'entry-v1', time_ms: 150, reduced_motion: false } } : {}), charts: [{ type: 'line', x: [0, 1], series: [{ y: [1, 2] }], ...(version >= 2 ? { axes: 'numeric-axes-v1', unit: 'mV', xUnit: 's' } : {}) }] };
    const raw = Buffer.from(JSON.stringify(value)); fs.writeFileSync(inputPath, raw);
    fs.writeFileSync(output, 'OLD-SVG', { mode: 0o640 }); fs.writeFileSync(receipt, 'OLD-RECEIPT', { mode: 0o604 });
    const captured = readRegular(inputPath, 4 * 1024 * 1024);
    let svg: Buffer, receiptBytes: Buffer;
    if (version === 3) {
      const input = validateFrameInput(value); svg = Buffer.from(renderFrameInput(input)); receiptBytes = makeFrameReceipt(input, captured.bytes, svg, '1.0.0', 'a'.repeat(64));
    } else if (version === 2) {
      const input = validateInputV2(value); svg = Buffer.from(renderInputV2(input)); receiptBytes = makeReceiptV2(input, captured.bytes, svg, '1.0.0');
    } else {
      const input = validateInput(value); svg = Buffer.from(renderInput(input)); receiptBytes = makeReceipt(input, captured.bytes, svg, '1.0.0');
    }
    const publish = () => publishPair(captured, output, receipt, svg, receiptBytes, {
      afterStages: stages => {
        if (fault === 'input-bytes') fs.appendFileSync(inputPath, ' ');
        if (fault === 'input-replace') { fs.renameSync(inputPath, inputPath + '.old'); fs.writeFileSync(inputPath, raw); }
        if (fault === 'stage-bytes') fs.writeFileSync(stages[0]!, 'changed');
        if (fault === 'stage-symlink') { fs.unlinkSync(stages[0]!); fs.symlinkSync(inputPath, stages[0]!); }
      },
      beforeRename: index => { if (fault === 'second-rename' && index === 1) throw new Error('injected failure'); },
    });
    if (fault === 'none') {
      publish(); assert.deepEqual(fs.readFileSync(output), svg); assert.deepEqual(fs.readFileSync(receipt), receiptBytes);
      assert.equal(fs.statSync(output).mode & 0o777, 0o640); assert.equal(fs.statSync(receipt).mode & 0o777, 0o604);
    } else {
      assert.throws(publish); assert.equal(fs.readFileSync(output, 'utf8'), 'OLD-SVG'); assert.equal(fs.readFileSync(receipt, 'utf8'), 'OLD-RECEIPT');
    }
    assert.ok(!fs.readdirSync(dir).some(name => name.startsWith('.plot-ts-')));
  });
}
