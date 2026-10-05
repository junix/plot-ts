import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, sep } from 'node:path';
const root = realpathSync(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const output = new URL('../dist/plot-provider-plot-ts.cjs', import.meta.url);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const nativeInput = name => /^(?:src\/svg|src\/style|src\/util)\//.test(name);
// Capture exactly the bytes esbuild consumes. The discovery pass chooses the native
// input set; the final pass embeds its identity and must consume that same set/bytes.
async function bundle(nativeSha256) {
  const captured = new Map();
  const result = await build({ absWorkingDir: root, entryPoints: ['src/provider/main.ts'], outfile: output.pathname, bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: false, metafile: true, write: false, legalComments: 'none', banner: { js: '#!/usr/bin/env node' }, define: { __PLOT_PROVIDER_VERSION__: JSON.stringify(manifest.version), __PLOT_PROVIDER_SOURCE_ROOT__: JSON.stringify(root), __PLOT_NATIVE_SOURCE_SHA256__: JSON.stringify(nativeSha256) }, plugins: [{ name: 'capture-source-bytes', setup(build) {
    build.onLoad({ filter: /\.(?:ts|json)$/ }, args => {
      const name = relative(root, args.path).split(sep).join('/');
      const bytes = readFileSync(args.path);
      captured.set(name, sha256(bytes));
      return { contents: bytes, loader: args.path.endsWith('.json') ? 'json' : 'ts' };
    });
  } }] });
  const names = Object.keys(result.metafile.inputs).sort();
  if (names.some(name => !captured.has(name))) throw new Error('Uncaptured build input');
  const sources = Object.fromEntries(names.map(name => [name, captured.get(name)]));
  const native = names.filter(nativeInput).map(name => [name, captured.get(name)]);
  if (!native.length) throw new Error('Empty native source set');
  return { result, sources, native };
}
const discovery = await bundle('discovery-only');
const nativeJson = JSON.stringify(discovery.native);
const nativeSha256 = sha256(Buffer.from(nativeJson));
const final = await bundle(nativeSha256);
if (JSON.stringify(final.native) !== nativeJson) throw new Error('Native inputs changed between build passes');
for (const [name, hash] of Object.entries(final.sources)) if (sha256(readFileSync(new URL('../' + name, import.meta.url))) !== hash) throw new Error('Build input changed before publication');
const built = final.result;
const allow = new Set(['node:fs', 'node:path', 'node:crypto']);
for (const file of Object.values(built.metafile.outputs)) for (const item of file.imports) if (!item.external || !allow.has(item.path) || item.kind !== 'require-call') throw new Error(`Unexpected runtime import: ${item.path}`);
for (const name of Object.keys(built.metafile.inputs)) if (!name.startsWith('src/provider/') && !name.startsWith('src/svg/') && !name.startsWith('src/style/') && !name.startsWith('src/util/')) throw new Error(`Unexpected bundled source: ${name}`);
const bytes = built.outputFiles[0].contents;
if (/\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/.test(Buffer.from(bytes).toString())) throw new Error('Dynamic code in provider bundle');
mkdirSync(new URL('../dist', import.meta.url), { recursive: true });
writeFileSync(output, bytes); chmodSync(output, 0o755);
const sources = final.sources;
writeFileSync(new URL('../dist/plot-provider-build.json', import.meta.url), JSON.stringify({ schema_version: 'plot-ts.provider-build/v1', provider_version: manifest.version, source_root: root, target: 'node22', script_sha256: sha256(bytes), runtime_imports: [...allow], source_sha256: sources, native_source: { schema_version: 'plot-ts.native-source-set/v1', sha256: nativeSha256, files: final.native }, build_runtime: process.versions.node }, null, 2) + '\n');
writeFileSync(new URL('../dist/plot-provider-LICENSE.txt', import.meta.url), 'ISC License (plot-ts package declared license)\n\nCopyright (c) plot-ts contributors\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHORS DISCLAIM ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.\n');
console.log(`Bundled standalone provider (${bytes.length} bytes)`);
