/**
 * plot-ts SVG 引擎 —— Node.js 演示脚本
 * 无需浏览器，直接生成 SVG 图表
 */

import { svg } from '../dist/plot-ts.js';
import { writeFileSync } from 'node:fs';

console.log('🚀 生成 6 种新 SVG 图表...\n');

// 1. 瀑布图
console.log('1️⃣  瀑布图 (Waterfall)');
const waterfallHtml = svg.figure({ width: 600, height: 400, title: '月度利润变化' })
  .waterfall({
    categories: ['营收', '成本', '毛利', '费用', '税费', '净利'],
    values: [120, -45, 75, -30, -15, 30],
  })
  .renderHtml();
writeFileSync('out/waterfall.html', waterfallHtml);

// 2. 环形图
console.log('2️⃣  环形图 (Donut)');
const donutHtml = svg.figure({ width: 500, height: 400, title: '市场份额' })
  .donut({
    items: [
      { name: '产品 A', value: 35 },
      { name: '产品 B', value: 25 },
      { name: '产品 C', value: 20 },
      { name: '产品 D', value: 15 },
      { name: '其他', value: 5 },
    ],
  })
  .renderHtml();
writeFileSync('out/donut.html', donutHtml);

// 3. 雷达图
console.log('3️⃣  雷达图 (Radar)');
const radarHtml = svg.figure({ width: 500, height: 500, title: '技能评估' })
  .radar({
    axes: [
      { name: '技术', max: 100 },
      { name: '沟通', max: 100 },
      { name: '领导', max: 100 },
      { name: '创新', max: 100 },
      { name: '执行', max: 100 },
    ],
    series: [
      { name: '员工 A', values: [85, 75, 65, 90, 80] },
      { name: '员工 B', values: [70, 90, 85, 75, 88] },
    ],
  })
  .renderHtml();
writeFileSync('out/radar.html', radarHtml);

// 4. 仪表盘
console.log('4️⃣  仪表盘 (Gauge)');
const gaugeHtml = svg.figure({ width: 400, height: 300, title: 'KPI 完成度' })
  .gauge({
    value: 78,
    max: 100,
    unit: '%',
  })
  .renderHtml();
writeFileSync('out/gauge.html', gaugeHtml);

// 5. 斜率图
console.log('5️⃣  斜率图 (Slope)');
const slopeHtml = svg.figure({ width: 500, height: 450, title: '各产品线利润率变化' })
  .slope({
    leftTitle: '2023',
    rightTitle: '2024',
    items: [
      { name: '产品线 1', left: 45, right: 65 },
      { name: '产品线 2', left: 60, right: 55 },
      { name: '产品线 3', left: 30, right: 48 },
      { name: '产品线 4', left: 75, right: 82 },
      { name: '产品线 5', left: 55, right: 70 },
    ],
  })
  .renderHtml();
writeFileSync('out/slope.html', slopeHtml);

// 6. 金字塔图
console.log('6️⃣  金字塔图 (Pyramid)');
const pyramidHtml = svg.figure({ width: 600, height: 400, title: '用户分层结构' })
  .pyramid({
    layers: [
      { name: 'VIP 用户', value: 5 },
      { name: '付费用户', value: 15 },
      { name: '活跃用户', value: 35 },
      { name: '注册用户', value: 60 },
      { name: '访客', value: 100 },
    ],
  })
  .renderHtml();
writeFileSync('out/pyramid.html', pyramidHtml);

console.log('\n✅ 所有图表已生成到 out/ 目录!');
console.log('\n📊 总计: 10 种 SVG 图表类型');
console.log('   - 基础: 柱状图、折线图、散点图、热力图');
console.log('   - 新增: 瀑布图、环形图、雷达图、仪表盘、斜率图、金字塔图');
