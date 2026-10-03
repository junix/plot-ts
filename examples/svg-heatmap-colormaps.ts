import { writeFileSync } from 'node:fs';
import { figure } from '../src/svg/index.js';

// Run with a TypeScript-capable runner, for example: bun examples/svg-heatmap-colormaps.ts
for (const colormap of ['viridis', 'plasma', 'blues'] as const) {
  const output = figure({ width: 720, height: 300, title: `Heatmap: ${colormap}` })
    .heatmap({
      data: [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0]],
      xLabels: ['Low', '20%', '40%', '60%', '80%', 'High'],
      yLabels: ['Forward', 'Reverse'],
      colormap,
    })
    .render();
  writeFileSync(`heatmap-${colormap}.svg`, output);
  console.log(`Wrote heatmap-${colormap}.svg`);
}
