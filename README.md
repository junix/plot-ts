# 🎨 plot-ts

**双引擎 TypeScript 绘图库** —— Matplotlib 风格 API。

- 🌐 **浏览器端**：ECharts 渲染，支持交互、动画、流式数据
- 🖥️ **服务端**：纯 SVG 渲染，零浏览器依赖，自动化报表专用

```typescript
// ===== 浏览器端 (ECharts 引擎) =====
import { figure } from 'plot-ts'

const fig = figure(document.getElementById('chart'), {
  title: '实时数据',
  animated: true
})

fig.plot(x, y, { smooth: true })
   .bar(categories, values)
   .render()

// ===== 服务端 (SVG 引擎) =====
import { svg } from 'plot-ts'

const svgString = svg.figure({ width: 800, height: 500 })
  .bar({
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ values: [120, 150, 180, 210] }]
  })
  .render() // 返回 SVG 字符串，可直接写入文件
```

---

## ✨ 特性

### 🌐 Browser / ECharts 引擎
- ✅ **流畅动画** —— 入场、数据更新、过渡动画
- ✅ **流式数据** —— `appendPoint()` / `stream()` 实时数据推送
- ✅ **悬停提示** —— Tooltip 自动生成
- ✅ **图例交互** —— 点击切换系列显示
- ✅ **缩放 / 平移** —— 大数据友好

### 🖥️ SVG / 服务端引擎
- ✅ **零浏览器依赖** —— Node.js 直接运行
- ✅ **纯 SVG 输出** —— 高质量、可缩放
- ✅ **麦肯锡 4 色专业配色** —— 参考 ppt-gen 设计
- ✅ **透明度分层系统** —— 专业图表层次感
- ✅ **完整 HTML 导出** —— 单文件，双击即开

### 📊 支持图表类型
| 图表 | Browser | SVG |
|------|---------|-----|
| 折线图 (Line) | ✅ | ✅ |
| 柱状图 (Bar/Column) | ✅ | ✅ |
| 散点图 (Scatter) | ✅ | ✅ |
| 热力图 (Heatmap) | ✅ | ✅ |
| 面积图 (Area) | ✅ | ⏳ |

---

## 🚀 快速开始

### 安装
```bash
npm install plot-ts echarts
```

### 浏览器端使用
```typescript
import { figure, normalData } from 'plot-ts'

// 1. 创建画布
const fig = figure(document.getElementById('my-chart'), {
  width: 800,
  height: 500,
  title: '数据分布对比',
  animated: true
})

// 2. 生成数据
const dataA = normalData(50, 50, 10)
const dataB = normalData(50, 70, 15)

// 3. 绘图 (链式 API)
fig.scatter(Array.from({ length: 50 }, (_, i) => i), dataA)
   .scatter(Array.from({ length: 50 }, (_, i) => i), dataB)
   .xAxis({ label: '样本序号' })
   .yAxis({ label: '数值' })
   .grid(true)
   .render()
```

### 服务端 SVG 渲染
```typescript
// Node.js 环境，不需要浏览器
import { svg } from 'plot-ts'
import fs from 'node:fs/promises'

// 生成完整 HTML 页面（带 CSS 样式）
const html = svg.figure({ width: 800, height: 500, title: '季度销售额' })
  .bar({
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { values: [120, 150, 180, 210] },
      { values: [80, 95, 110, 130] },
    ],
    yAxis: true,
  })
  .renderHtml()

await fs.writeFile('report.html', html)
console.log('✅ 报告已生成')
```

---

## 🎯 API 设计原则

### Matplotlib 风格
- `figure()` —— 创建画布
- `plot()` / `scatter()` / `bar()` / `heatmap()` —— 绘图函数
- `xAxis()` / `yAxis()` —— 坐标轴配置
- `grid()` —— 网格显示
- `render()` —— 渲染输出

### 专业配色系统 (参考 ppt-gen)
```typescript
import { INK, ACCENTS, INK_ALPHA, palette } from 'plot-ts'

// 4 色系统，层次靠透明度
INK = '#051C2C'          // 主色 —— 深藏蓝
ACCENTS.cyan = '#00A9F0' // 强调色 —— 只用于需要被看见的地方
NEUTRAL = '#E6E8EA'      // 中性灰 —— 被比较掉的数据
PAPER = '#FFFFFF'        // 背景

// 透明度 7 档分层
INK_ALPHA = {
  strong: 1,    // 正文强调
  body: 0.86,   // 正文
  muted: 0.62,  // 次要说明
  faint: 0.58,  // 轴标签 / 页码
  ghost: 0.46,  // 脚注 / 出处
  rule: 0.16,   // 分隔线
  grid: 0.08    // 网格线
}
```

---

## 📁 项目架构

```
plot-ts/
├── src/
│   ├── index.ts          # 统一入口
│   ├── core/
│   │   └── plotter.ts    # ECharts 绘图类
│   ├── svg/
│   │   ├── index.ts      # SVG 引擎入口
│   │   ├── charts.ts     # SVG 图表渲染器
│   │   └── context.ts    # SVG 绘图上下文
│   ├── style/
│   │   ├── palette.ts    # 简单配色（向后兼容）
│   │   └── tokens.ts     # 专业设计令牌系统 (ppt-gen 风格)
│   ├── data/
│   │   └── generators.ts # 数据生成器
│   └── util/
│       ├── scale.ts      # 比例尺 / 数值格式化工具
│       └── html.ts       # HTML/SVG 构建辅助
├── examples/
│   ├── demo.html         # 浏览器交互演示
│   └── svg-demo.js       # 服务端 SVG 演示
├── dist/                 # 构建输出 (ESM/UMD/IIFE)
└── package.json
```

---

## 🔧 命令

```bash
npm run build       # 构建 + 类型声明
npm run lint        # TypeScript 类型检查
npm run dev         # 开发服务器 (Vite)
```

---

## 📌 技术栈

| 层 | 技术 | 说明 |
|----|------|-----|
| 浏览器渲染 | ECharts 6.x | 交互、动画、性能优秀 |
| SVG 渲染 | 纯函数实现 | 参考 ppt-gen 架构，零依赖 |
| 类型系统 | TypeScript 7.x | exactOptionalPropertyTypes |
| 构建工具 | Vite 4.x | ESM/UMD/IIFE 三格式 |
| 设计系统 | 4 色原则 + 透明度分层 | 参考麦肯锡 ppt-gen |

---

## 🙏 参考

- **ppt-gen** —— 纯 SVG 渲染、4 色设计系统、专业版式
- **Matplotlib** —— API 设计风格
- **ECharts** —— 浏览器端渲染引擎

---

**MIT License** —— 2024
