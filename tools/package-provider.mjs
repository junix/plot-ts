import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const dist = new URL('../dist/', import.meta.url), files = ['plot-provider-plot-ts.cjs', 'plot-provider-LICENSE.txt', 'plot-provider-build.json'];
writeFileSync(new URL('plot-provider-SHA256SUMS', dist), files.map(name => createHash('sha256').update(readFileSync(new URL(name, dist))).digest('hex') + '  ' + name + '\n').join(''));
execFileSync('tar', ['-czf', new URL('plot-provider-plot-ts.tgz', dist).pathname, '-C', dist.pathname, ...files, 'plot-provider-SHA256SUMS']);
console.log('Created standalone dist/plot-provider-plot-ts.tgz');
