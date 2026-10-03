import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { figure } from '../src/svg/index.js';

// Deterministic illustrative data, not measured business results.
const grid = figure({
  width: 1000,
  height: 760,
  title: 'Independent panels · illustrative data',
  columns: 2,
  gap: 32,
})
  .bar({
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ values: [32, 45, 51, 68] }, { values: [25, 38, 47, 56] }],
    yAxis: true,
  })
  .donut({
    items: [
      { name: 'North', value: 60 },
      { name: 'South', value: 40 },
    ],
  })
  .radar({
    axes: ['Quality', 'Speed', 'Value', 'Support', 'Reliability'].map(name => ({ name, max: 10 })),
    series: [{ values: [8, 7, 9, 6, 8] }, { values: [6, 9, 7, 8, 6] }],
  })
  .slope({
    leftTitle: 'Before',
    rightTitle: 'After',
    items: [
      { name: 'Product A', left: 30, right: 62 },
      { name: 'Product B', left: 60, right: 46 },
    ],
  });

const gallery = figure({
  width: 1600,
  height: 1480,
  title: 'All ten SVG chart families · independent domains · illustrative data',
  columns: 3,
  gap: 32,
})
  .bar({ categories: ['A', 'B', 'C'], series: [{ values: [20, 40, 32] }], yAxis: true })
  .line({ x: [0, 1, 2, 3, 4], series: [{ y: [4, 8, 6, 12, 10] }, { y: [2, 4, 5, 7, 8] }], yAxis: true })
  .scatter({ points: [{ x: 1, y: 3 }, { x: 2, y: 7 }, { x: 4, y: 5 }, { x: 6, y: 9 }], yAxis: true })
  .heatmap({ data: [[1, 4, 8], [3, 9, 5], [7, 2, 6]], yLabels: ['Alpha', 'Beta', 'Gamma'] })
  .waterfall({ categories: ['Start', 'Gain', 'Loss', 'Gain'], values: [20, 10, -5, 15] })
  .donut({ items: [{ name: 'Alpha', value: 55 }, { name: 'Beta', value: 45 }] })
  .radar({ axes: [{ name: 'Quality', max: 10 }, { name: 'Speed', max: 10 }, { name: 'Value', max: 10 }], series: [{ values: [8, 6, 9] }] })
  .gauge({ value: 72, max: 100, unit: '%' })
  .slope({ leftTitle: 'Before', rightTitle: 'After', items: [{ name: 'Alpha', left: 20, right: 45 }, { name: 'Beta', left: 40, right: 30 }] })
  .pyramid({ layers: [{ name: 'Visitors', value: 100 }, { name: 'Customers', value: 35 }] });

const outputDirectory = process.argv[2] ?? 'out';
await mkdir(outputDirectory, { recursive: true });
for (const [name, chart] of [['svg-grid', grid], ['svg-gallery', gallery]] as const) {
  await writeFile(join(outputDirectory, name + '.svg'), chart.render());
  await writeFile(join(outputDirectory, name + '.html'), chart.renderHtml());
}
console.log('Wrote SVG and HTML grid examples to ' + outputDirectory);
