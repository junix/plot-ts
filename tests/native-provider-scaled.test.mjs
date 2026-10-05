import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { figure } from '../dist/svg.js';
const { createCanvas, loadImage } = createRequire(import.meta.url)('canvas');
const dir = mkdtempSync(join(tmpdir(), 'plot-native-scaled-provider-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const hash = b => createHash('sha256').update(b).digest('hex');
async function rgba(svg) { const img = await loadImage(Buffer.from(svg)), c = createCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
test('actual scaled provider native SVG and node-canvas pixels match all four line/scatter scale combinations', async () => {
  for (const xScale of ['linear', 'log10']) for (const yScale of ['linear', 'log10']) for (const type of ['line', 'scatter']) {
    const chart = { type, axes: 'scaled-axes-v1', xScale, yScale, unit: 'W', xUnit: 's', ...(type === 'line' ? { x: [1, 10, 100], series: [{ y: [1, 10, 100] }] } : { points: [{ x: 1, y: 1 }, { x: 10, y: 10, size: 10 }, { x: 100, y: 100, size: 0 }] }) };
    const d = { schema_version: 'plot-ts.svg-scaled-figure/v1', figure: { width: 640, height: 400, theme: 'sage', surfacePolicy: 'transparent-auto-v1' }, charts: [chart] };
    const input = join(dir, 'input.json'), output = join(dir, 'output.svg'), receipt = join(dir, 'receipt.json'), raw = Buffer.from(JSON.stringify(d)); writeFileSync(input, raw);
    const p = spawnSync(process.execPath, [join(process.cwd(), 'dist/plot-provider-plot-ts.cjs'), 'render-svg-scaled-v1', input, '--resource-pins', JSON.stringify({ input: hash(raw) }), '--output', output, '--receipt', receipt], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, timeout: 30000 });
    assert.equal(p.status, 0, p.stderr); const actual = readFileSync(output, 'utf8'), expected = figure(d.figure)[type](chart).render();
    assert.equal(actual, expected); assert.deepEqual(await rgba(actual), await rgba(expected));
    assert.equal(JSON.parse(readFileSync(receipt)).artifact_receipt.primary.sha256, hash(actual));
  }
});
