/**
 * 纯 SVG 引擎 Node.js 演示
 * 不需要浏览器，直接生成 SVG 文件
 */

import { svg } from '../dist/plot-ts.js';
const { figure } = svg;
import fs from 'node:fs/promises';

// 1. 柱状图
const barChart = figure({ width: 600, height: 400, title: '季度销售额' })
  .bar({
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: '产品 A', values: [120, 150, 180, 210] },
      { name: '产品 B', values: [80, 95, 110, 130] },
    ],
    yAxis: true,
  })
  .renderHtml();

await fs.writeFile('out/bar-chart.html', barChart);
console.log('✅ 已生成柱状图: out/bar-chart.html');

// 2. 折线图
const lineChart = figure({ width: 600, height: 400, title: '增长曲线对比' })
  .line({
    x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    series: [
      { y: [0, 10, 25, 45, 70, 100, 135, 175, 220, 270], smooth: true },
      { y: [0, 8, 18, 32, 50, 72, 98, 128, 162, 200], smooth: true },
    ],
    yAxis: true,
  })
  .renderHtml();

await fs.writeFile('out/line-chart.html', lineChart);
console.log('✅ 已生成折线图: out/line-chart.html');

// 3. 散点图
const scatterPoints = Array.from({ length: 100 }, () => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
}));

const scatterChart = figure({ width: 500, height: 500, title: '随机散点分布' })
  .scatter({ points: scatterPoints })
  .renderHtml();

await fs.writeFile('out/scatter-chart.html', scatterChart);
console.log('✅ 已生成散点图: out/scatter-chart.html');

// 4. 热力图
const heatmapData = Array.from({ length: 7 }, () =>
  Array.from({ length: 24 }, () => Math.random())
);

const heatmapChart = figure({ width: 800, height: 300, title: '用户活跃度热力图 (周 × 小时)' })
  .heatmap({
    data: heatmapData,
    yLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  })
  .renderHtml();

await fs.writeFile('out/heatmap-chart.html', heatmapChart);
console.log('✅ 已生成热力图: out/heatmap-chart.html');

console.log('\n🎉 所有 SVG 图表生成完毕！打开 out/ 目录下的 HTML 文件查看效果。');
