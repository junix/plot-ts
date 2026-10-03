import { writeFileSync } from 'node:fs';
import { figure } from '../src/svg/index.js';

// Run with a TypeScript-capable runner, for example: bun examples/svg-heatmap-labels.ts
const output = figure({ width: 720, height: 360, title: 'Weekly activity' })
  .heatmap({
    data: [[2, 4, 1, 5, 3], [3, 1, 5, 2, 4], [1, 3, 4, 2, 5]],
    xLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    yLabels: ['Design', 'Build', 'Review'],
  })
  .render();

writeFileSync('heatmap-labels.svg', output);
console.log('Wrote heatmap-labels.svg');
