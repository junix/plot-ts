import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const root = process.cwd()
const require = createRequire(join(root, 'package.json'))
const temporary = mkdtempSync(join(tmpdir(), 'plot-ts-package-'))
after(() => rmSync(temporary, { recursive: true, force: true }))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = JSON.parse(execFileSync(npm, [
  'pack', '--ignore-scripts', '--json', '--pack-destination', temporary,
  '--cache', join(temporary, 'npm-cache'),
], { cwd: root, encoding: 'utf8' }))[0]
const consumer = join(temporary, 'consumer')
const installed = join(consumer, 'node_modules', 'plot-ts')
mkdirSync(installed, { recursive: true })
execFileSync('tar', ['-xzf', join(temporary, result.filename), '-C', installed, '--strip-components=1'])
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))

function run(source) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' },
  })
}

test('packed exports include their JS and declarations, plus browser bundles', () => {
  const files = new Set(result.files.map(file => file.path))
  for (const entry of Object.values(manifest.exports)) {
    assert.equal(Object.keys(entry)[0], 'types', 'TypeScript condition must precede runtime conditions')
    for (const target of Object.values(entry)) {
      assert.ok(files.has(target.replace(/^\.\//, '')), `Missing packed export: ${target}`)
    }
  }
  for (const file of ['dist/plot-ts.umd.cjs', 'dist/plot-ts.iife.js']) assert.ok(files.has(file), file)
})

test('packed SVG entry renders without any installed runtime dependency or DOM', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure, SvgFigure } from 'plot-ts/svg';
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');
    const chart = figure({ width: 400, height: 300, title: 'Packed & tested' });
    assert.ok(chart instanceof SvgFigure);
    const svg = chart.bar({ categories: ['A'], series: [{ values: [2] }] }).render();
    assert.match(svg, /<svg[^>]*width="400"[^>]*height="300"/);
    assert.ok(svg.includes('Packed &amp; tested'));
    console.log('SVG package smoke passed');
  `)
  assert.match(output, /SVG package smoke passed/)
})

test('packed declarations resolve the SVG entry in a clean NodeNext consumer', () => {
  writeFileSync(join(consumer, 'svg.ts'), `
    import { figure, SvgFigure, type SvgFigureOptions } from 'plot-ts/svg';
    const options: SvgFigureOptions = { width: 400, height: 300 };
    const chart: SvgFigure = figure(options);
    const output: string = chart.bar({ categories: ['A'], series: [{ values: [2] }] }).render();
    // @ts-expect-error SVG entry does not accept the browser's container/config signature.
    figure(document.body, { width: 400 });
    // @ts-expect-error Width must be numeric.
    figure({ width: '400' });
  `)
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, types: [] },
    files: ['svg.ts'],
  }))
  execFileSync(process.execPath, [join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'), '-p', consumer], {
    cwd: consumer, encoding: 'utf8',
  })
})

test('root export preserves browser API and SVG namespace with its declared ECharts dependency', () => {
  symlinkSync(dirname(require.resolve('echarts/package.json')), join(consumer, 'node_modules', 'echarts'), 'junction')
  const output = run(`
    import assert from 'node:assert/strict';
    import { Figure, figure, svg } from 'plot-ts';
    import { figure as svgFigure, SvgFigure } from 'plot-ts/svg';
    assert.equal(typeof Figure, 'function');
    assert.equal(typeof figure, 'function');
    assert.notEqual(figure, svgFigure);
    assert.ok(svg.figure() instanceof svg.SvgFigure);
    assert.ok(svg.figure().render().startsWith('<svg'));
    assert.ok(svgFigure() instanceof SvgFigure);
    console.log('Root package smoke passed');
  `)
  assert.match(output, /Root package smoke passed/)
  writeFileSync(join(consumer, 'browser.ts'), `
    import { figure, Figure, svg } from 'plot-ts';
    import type { SvgFigure } from 'plot-ts/svg';
    const chart: Figure = figure(document.body, { width: 400 });
    const report: SvgFigure = svg.figure({ width: 400 });
    // @ts-expect-error Browser entry requires a container.
    figure({ width: 400 });
  `)
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, types: [] },
    files: ['browser.ts'],
  }))
  execFileSync(process.execPath, [join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'), '-p', consumer], {
    cwd: consumer, encoding: 'utf8',
  })
})
