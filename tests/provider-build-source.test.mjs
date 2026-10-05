import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const hash = b => createHash('sha256').update(b).digest('hex');
const root = process.cwd(), temporary = fs.mkdtempSync(join(tmpdir(), 'plot-provider-source-build-'));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
fs.cpSync(join(root, 'src'), join(temporary, 'src'), { recursive: true });
fs.mkdirSync(join(temporary, 'tools')); fs.copyFileSync(join(root, 'tools/build-provider.mjs'), join(temporary, 'tools/build-provider.mjs'));
fs.copyFileSync(join(root, 'package.json'), join(temporary, 'package.json'));
fs.symlinkSync(fs.realpathSync(join(root, 'node_modules')), join(temporary, 'node_modules'));
const build = extra => spawnSync(process.execPath, [...(extra ?? []), 'tools/build-provider.mjs'], { cwd: temporary, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, encoding: 'utf8', timeout: 30000 });
const manifest = () => JSON.parse(fs.readFileSync(join(temporary, 'dist/plot-provider-build.json')));
const script = () => fs.readFileSync(join(temporary, 'dist/plot-provider-plot-ts.cjs'));

test('native identity follows exactly bundled bytes, excludes unused source, and is not a commit or script self-hash', () => {
  let r = build(); assert.equal(r.status, 0, r.stderr);
  const original = manifest(), first = script();
  assert.equal(original.native_source.sha256, hash(JSON.stringify(original.native_source.files)));
  fs.writeFileSync(join(temporary, 'src/svg/unused-proof.ts'), 'export const unused = "not bundled";\n');
  r = build(); assert.equal(r.status, 0, r.stderr);
  assert.equal(manifest().native_source.sha256, original.native_source.sha256); assert.deepEqual(script(), first);
  fs.appendFileSync(join(temporary, 'src/svg/motion.ts'), '\n// Consumed source-byte identity witness.\n');
  r = build(); assert.equal(r.status, 0, r.stderr);
  const changed = manifest(); assert.notEqual(changed.native_source.sha256, original.native_source.sha256);
  assert.notEqual(changed.script_sha256, original.script_sha256);
  assert.equal(changed.source_sha256['src/svg/motion.ts'], hash(fs.readFileSync(join(temporary, 'src/svg/motion.ts'))));
  assert.ok(!changed.native_source.files.some(([p]) => p.includes('unused-proof')));
  assert.ok(script().includes(Buffer.from(changed.native_source.sha256))); assert.ok(!script().includes(Buffer.from(changed.script_sha256)));
});

test('source-byte drift between discovery/final or final/on-disk checks fails before publishing', () => {
  for (const readNumber of [2, 3]) {
    const beforeScript = script(), beforeManifest = fs.readFileSync(join(temporary, 'dist/plot-provider-build.json'));
    const preload = join(temporary, `drift-${readNumber}.mjs`);
    fs.writeFileSync(preload, `import fs from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nconst read = fs.readFileSync; let count = 0;\nfs.readFileSync = function(path, ...args) { const bytes = read.call(this, path, ...args); if (String(path).endsWith('/src/svg/motion.ts') && ++count === ${readNumber}) return Buffer.concat([Buffer.from(bytes), Buffer.from('\\n// Injected changed build input.\\n')]); return bytes; };\nsyncBuiltinESMExports();\n`);
    const result = build(['--import', preload]);
    assert.notEqual(result.status, 0); assert.match(result.stderr, readNumber === 2 ? /Native inputs changed between build passes/ : /Build input changed before publication/);
    assert.deepEqual(script(), beforeScript); assert.deepEqual(fs.readFileSync(join(temporary, 'dist/plot-provider-build.json')), beforeManifest);
  }
});
