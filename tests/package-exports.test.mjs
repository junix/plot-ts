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

test('packed canonical SVG registry and all variants work without runtime dependencies', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme } from 'plot-ts/svg';
    assert.equal(CANONICAL_THEME_NAMES.length, 14);
    assert.equal(typeof globalThis.document, 'undefined');
    for (const name of CANONICAL_THEME_NAMES) {
      const theme = getCanonicalTheme(name);
      const svg = figure({ theme: name, title: name }).bar({ categories: ['A'], series: [{ values: [2] }] }).render();
      assert.ok(svg.includes('fill="' + theme.tokens['--s1'] + '"'));
      assert.ok(svg.includes('fill="' + theme.tokens['--paper'] + '"'));
      assert.ok(svg.includes('fill="' + theme.tokens['--ink'] + '"'));
    }
    assert.throws(() => getCanonicalTheme('unknown'), RangeError);
    console.log('Packed canonical themes passed');
  `)
  assert.match(output, /Packed canonical themes passed/)
})

test('packed SVG surface policy works without runtime dependencies and preserves default bytes', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure, SURFACE_POLICIES, SURFACE_POLICY_VERSION, parseSurfacePolicy } from 'plot-ts/svg';
    assert.equal(SURFACE_POLICY_VERSION, 'plot.surface-policy/v1');
    assert.equal(SURFACE_POLICIES.length, 3);
    const make = options => figure(options).bar({ categories: ['A'], series: [{ values: [2] }] });
    assert.equal(make({}).renderHtml(), make({ surfacePolicy: 'themed-v1' }).renderHtml());
    const chart = make({ theme: 'sage-dark', surfacePolicy: 'transparent-auto-v1' });
    assert.match(chart.render(), /fill="none" data-plot-surface="paper"/);
    assert.ok(chart.renderHtml().includes('.chart-container { background: transparent;'));
    assert.throws(() => parseSurfacePolicy('transparent'), RangeError);
    assert.throws(() => figure({ surfacePolicy: null }), RangeError);
    console.log('Packed SVG surfaces passed');
  `)
  assert.match(output, /Packed SVG surfaces passed/)
})

test('packed SVG entry enforces the non-negative and explicit-option contracts', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure } from 'plot-ts/svg';
    assert.equal(typeof globalThis.document, 'undefined');
    const cases = [
      [() => figure().donut({ items: [{ name: 'A', value: -1 }] }).render(), 'Donut values must be non-negative'],
      [() => figure().radar({ axes: [{ name: 'A' }], series: [{ values: [-1] }] }).render(), 'Radar values must be non-negative'],
      [() => figure().radar({ axes: [{ name: 'A', max: 0 }], series: [] }).render(), 'Radar maximum must be finite and positive'],
      [() => figure().gauge({ value: 1, max: 2, bands: null }).render(), 'Gauge bands must be an array'],
      [() => figure().gauge({ value: 1, max: 2, bands: [{ from: 0, to: NaN, color: 'red' }] }).render(), 'Gauge band endpoints must be finite'],
      [() => figure().gauge({ value: 1, max: 2, bands: [{ from: 2, to: 1, color: 'red' }] }).render(), 'Gauge band endpoints must satisfy 0 <= from <= to <= maximum'],
    ];
    for (const [render, message] of cases) assert.throws(render, { name: 'RangeError', message });
    const svg = figure().donut({ items: [{ name: 'A', value: 1 }] })
      .radar({ axes: [{ name: 'A', max: 2 }], series: [{ values: [1] }] })
      .gauge({ value: 1, max: 2, bands: [{ from: 0, to: 2, color: 'red' }] }).render();
    assert.doesNotMatch(svg, /NaN|Infinity/);
    console.log('SVG option contracts passed');
  `)
  assert.match(output, /SVG option contracts passed/)
})

test('packed SVG heatmaps fit long labels while preserving full escaped titles', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure } from 'plot-ts/svg';
    const label = '<Quarterly & international operations>'.repeat(20);
    const svg = figure({ width: 160, height: 120 }).heatmap({
      data: [[1]], xLabels: [label], yLabels: [label, 'ignored'],
    }).render();
    assert.ok(svg.includes('x="60" y="2" width="90" height="94"'));
    assert.ok(svg.includes('<title>&lt;Quarterly &amp; international operations&gt;'));
    assert.ok(svg.includes('lengthAdjust="spacingAndGlyphs"'));
    assert.ok(svg.includes('…</text>'));
    assert.ok(!svg.includes('ignored'));
    assert.ok(!svg.includes('<Quarterly'));
    console.log('Packed heatmap layout passed');
  `)
  assert.match(output, /Packed heatmap layout passed/)
})

const dataDomainCases = JSON.parse(readFileSync(new URL('./fixtures/svg-data-domain-cases.json', import.meta.url), 'utf8'))
const dataDomainGolden = JSON.parse(readFileSync(new URL('./fixtures/svg-data-domain-golden.json', import.meta.url), 'utf8'))
const dataDomainChecks = `
    const domainCases = ${JSON.stringify(dataDomainCases)};
    const domainGolden = ${JSON.stringify(dataDomainGolden)};
    for (const sample of domainCases) {
      const original = structuredClone(sample.config);
      const chart = domainFigure({ width: 800, height: 500 })[sample.method](sample.config);
      if (sample.error) {
        assert.throws(() => chart.render(), error => error instanceof RangeError && error.message.includes(sample.error));
        assert.throws(() => chart.renderHtml(), RangeError);
        assert.throws(() => domainFigure({ width: 1000, height: 500 }).heatmap({ data: [[1]] })[sample.method](sample.config).render(), RangeError);
      } else {
        const result = chart.render();
        assert.doesNotMatch(result, /NaN|Infinity|undefined/);
        assert.equal(createHash('sha256').update(result).digest('hex'), domainGolden[sample.name]);
        assert.equal(chart.render(), result);
        assert.equal(chart.renderFrame(1600), result);
        assert.doesNotThrow(() => chart.renderHtml());
      }
      assert.deepEqual(sample.config, original);
    }
`

test('packed SVG entry fails closed on unrepresentable computed data domains', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { figure as domainFigure } from 'plot-ts/svg';
    assert.equal(typeof globalThis.document, 'undefined');
    ${dataDomainChecks}
    console.log('Packed data domains passed');
  `)
  assert.match(output, /Packed data domains passed/)
})

const panelGeometryChecks = `
    const panels = [
      ['bar', { categories: ['A'], series: [{ values: [1] }] }, { categories: [], series: [] }, 10, 46],
      ['line', { x: [0, 1], series: [{ y: [1, 2] }] }, { x: [], series: [] }, 10, 46],
      ['scatter', { points: [{ x: 1, y: 2 }] }, { points: [] }, 20, 34],
      ['heatmap', { data: [[1]] }, { data: [] }, 20, 4],
      ['waterfall', { categories: ['A'], values: [1] }, { categories: [], values: [] }, 60, 60],
      ['donut', { items: [{ name: 'A', value: 1 }] }, { items: [] }, 40, 40],
      ['radar', { axes: [{ name: 'A' }], series: [{ values: [1] }] }, { axes: [], series: [] }, 80, 80],
      ['gauge', { value: 1, max: 2 }, { value: 0, bands: [] }, 0, 0],
      ['slope', { items: [{ name: 'A', left: 1, right: 2 }] }, { items: [] }, 160, 60],
      ['pyramid', { layers: [{ name: 'A', value: 1 }] }, { layers: [] }, 200, 20],
    ];
    for (const [method, data, empty, minWidth, minHeight] of panels) {
      for (const config of [data, empty]) {
        assert.throws(() => panelFigure({ width: minWidth, height: 300 })[method](config).render(), RangeError);
        assert.throws(() => panelFigure({ width: 400, height: minHeight + 40, title: 'Title' })[method](config).render(), RangeError);
        for (const title of ['', 'Title']) {
          const result = panelFigure({ width: minWidth + .02, height: minHeight + .02 + (title ? 40 : 0), title })[method](config).render();
          assert.doesNotMatch(result, /NaN|Infinity/);
          const grid = panelFigure({ width: 320, height: 120 + (title ? 40 : 0), gap: 0, title })[method](config)[method](config);
          if (minWidth >= 160) assert.throws(() => grid.render(), RangeError);
          else assert.doesNotThrow(() => grid.render());
        }
      }
    }
    assert.throws(() => panelFigure({ width: Number.MAX_VALUE, height: Number.MAX_VALUE }).radar({ axes: [], series: [] }).render(), /grid radii/);
    assert.throws(() => panelFigure({ width: 1e20, height: 100 }).bar({ categories: ['A'], series: [{ values: [1] }] }).render(), /drawable width/);
    for (const columns of [1, 2]) {
      assert.throws(() => panelFigure({ width: Number.MAX_VALUE, height: Number.MAX_VALUE, gap: Number.MAX_VALUE / 2, columns })
        .heatmap({ data: [[1]] }).heatmap({ data: [[2]] }).render(), /panel positions/);
    }
    assert.doesNotThrow(() => panelFigure({ width: 1, height: 1, title: 'Title' }).render());
    const scatter = panelFigure({ width: 100, height: 80 }).scatter({ points: [
      { x: 0, y: 0, size: 15 }, { x: 1, y: 10, size: 15 },
    ] }).render();
    const marks = [...scatter.matchAll(/<circle[^>]*cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)];
    assert.equal(marks.length, 2);
    for (const [, cx, cy, radius] of marks) {
      assert.ok(+radius <= +cx && +radius <= 100 - +cx && +radius <= +cy && +radius <= 80 - +cy);
      assert.equal(+radius, 15);
    }
    assert.throws(() => panelFigure({ width: 30, height: 80 }).scatter({ points: [{ x: 0, y: 0, size: 15 }] }).render(), RangeError);
`;

test('packed SVG entry enforces panel geometry for all ten chart families', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure as panelFigure } from 'plot-ts/svg';
    ${panelGeometryChecks}
    console.log('Packed panel geometry passed');
  `)
  assert.match(output, /Packed panel geometry passed/)
})

test('packed declarations resolve the SVG entry in a clean NodeNext consumer', () => {
  writeFileSync(join(consumer, 'svg.ts'), `
    import { figure, SvgFigure, type SvgFigureOptions, type SvgFrameOptions } from 'plot-ts/svg';
    const options: SvgFigureOptions = { width: 400, height: 300, theme: 'sage-dark', surfacePolicy: 'transparent-auto-v1' };
    // @ts-expect-error Surface policy identifiers are versioned and exact.
    figure({ surfacePolicy: 'transparent' });
    // @ts-expect-error SVG accepts exact canonical names only.
    figure({ theme: 'not-canonical' });
    const chart: SvgFigure = figure(options);
    const output: string = chart.bar({ categories: ['A'], series: [{ values: [2] }] }).render();
    const frameOptions: SvgFrameOptions = { reducedMotion: true };
    const frame: string = chart.renderFrame(1600, frameOptions);
    // @ts-expect-error Frame time must be numeric.
    chart.renderFrame('start');
    // @ts-expect-error reducedMotion must be a boolean.
    chart.renderFrame(0, { reducedMotion: 1 });
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

test('packed SVG entry motion and pure frames work without runtime dependencies', () => {
  const output = run(`
    import assert from 'node:assert/strict';
    import { figure } from 'plot-ts/svg';
    const config = {points:[{x:0,y:0,size:24},{x:1,y:1,size:24}]};
    const plain = figure().scatter(config).render();
    const active = figure({animated:true}).scatter(config);
    assert.ok(active.render().includes('plot-ts-svg-entry-v1-fade'));
    assert.ok(active.render().includes('opacity="0.7"'));
    assert.equal(active.renderFrame(1600),plain);
    assert.equal(active.renderFrame(0,{reducedMotion:true}),plain);
    assert.notEqual(active.renderFrame(100),active.renderFrame(0));
    assert.equal(active.renderFrame(100),active.renderFrame(100));
    assert.ok(!figure({animated:false}).scatter(config).renderHtml().includes('@keyframes'));
    assert.throws(()=>active.renderFrame(NaN),RangeError);
    const dense={points:Array.from({length:2049},(_,i)=>({x:i,y:i%3,size:0}))};
    assert.throws(()=>figure({animated:true}).scatter(dense).render(),/2048/);
    assert.ok(!figure().scatter(dense).renderHtml().includes('data-plot-motion'));
    console.log('Packed entry motion passed');
  `);
  assert.match(output,/Packed entry motion passed/);
});

test('root export preserves browser API and SVG namespace with its declared ECharts dependency', () => {
  symlinkSync(dirname(require.resolve('echarts/package.json')), join(consumer, 'node_modules', 'echarts'), 'junction')
  const output = run(`
    import assert from 'node:assert/strict';
    import { Figure, figure, svg, CANONICAL_THEME_NAMES, getCanonicalTheme } from 'plot-ts';
    import { createHash } from 'node:crypto';
    import { figure as svgFigure, SvgFigure } from 'plot-ts/svg';
    assert.equal(CANONICAL_THEME_NAMES.length, 14);
    assert.deepEqual(getCanonicalTheme('sage-dark'), svg.getCanonicalTheme('sage-dark'));
    assert.equal(typeof Figure, 'function');
    assert.equal(typeof figure, 'function');
    assert.notEqual(figure, svgFigure);
    assert.ok(svg.figure() instanceof svg.SvgFigure);
    assert.ok(svg.figure().render().startsWith('<svg'));
    assert.ok(svgFigure() instanceof SvgFigure);
    const moving = svg.figure({ animated: true }).scatter({ points: [{ x: 0, y: 0 }] });
    assert.ok(moving.render().includes('plot-ts-svg-entry-v1-fade'));
    assert.equal(moving.renderFrame(1600), svg.figure().scatter({ points: [{ x: 0, y: 0 }] }).render());
    const domainFigure = svg.figure;
    ${dataDomainChecks}
    const panelFigure = svg.figure;
    ${panelGeometryChecks}
    console.log('Root package smoke passed');
  `)
  assert.match(output, /Root package smoke passed/)
  writeFileSync(join(consumer, 'browser.ts'), `
    import { figure, Figure, svg } from 'plot-ts';
    import type { SvgFigure } from 'plot-ts/svg';
    const chart: Figure = figure(document.body, { width: 400 });
    figure(document.body, { surfacePolicy: 'transparent-auto-v1' });
    // @ts-expect-error Browser surface policy identifiers are exact and versioned.
    figure(document.body, { surfacePolicy: 'transparent' });
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


