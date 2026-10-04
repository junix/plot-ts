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

### 浏览器坐标轴配置

`xAxis()` 和 `yAxis()` 支持多次局部更新：只覆盖本次提供的字段，省略的字段保持不变。
`min` / `max` 设置坐标范围，`log: true` 使用对数轴，`log: false` 恢复数值轴。
只修改标签、范围或网格时，不会将柱状图、热力图等的分类轴改成数值轴。
`grid` 控制该轴的网格线；`fig.grid()` 仍控制绘图区的边框/背景显示。

```typescript
fig.xAxis({ label: 'Time', min: 0, max: 100 })
   .xAxis({ max: 200 }) // 保留标签和 min，只更新 max
   .yAxis({ log: true, grid: false })
   .yAxis({ label: 'Values' }) // 保留对数轴和网格设置
   .update()
```

### Browser heatmap colormaps

`fig.heatmap(data, xLabels, yLabels, { colormap })` honors `viridis`, `plasma`,
`blues`, `rdbu`, and `heat`. The first four reuse the existing `COLORS` ramps;
`heat` adds black → red → yellow → white in `src/style/palette.ts`. ECharts
interpolates between the provided stops. The first heatmap defaults to `viridis`.

A browser Figure has one shared pair of axes and one horizontal color controller.
All its heatmaps share a palette: later omitted or `undefined` selections inherit
the first heatmap's choice, and an explicit matching selection is accepted.
An explicit conflicting choice, or any unsupported runtime value (including
`null`), throws `RangeError` in `heatmap()` before adding a series or changing
axes, even for an empty matrix. Use separate Figures for independent color scales.
The visualMap targets heatmap series only, using their third data dimension;
line, scatter, and other series keep their own colors. `render()` and `update()`
preserve the selected palette.

```typescript
fig.heatmap([[0, 1], [2, 3]], ['A', 'B'], ['Top', 'Bottom'], { colormap: 'plasma' })
   .heatmap([[3, 2], [1, 0]]) // inherits plasma
   .render()
```

### 服务端 SVG 渲染

`plot-ts/svg` 是独立的纯 SVG 入口，导出 `figure`、`SvgFigure` 和图表类型。
该入口加载与渲染时不需要 DOM 或 ECharts；包的现有安装依赖保持不变。
统一入口 `plot-ts` 继续导出浏览器 `figure` 和 `svg` 命名空间。
两个入口分别打包，不保证 `svg.SvgFigure` 与 `plot-ts/svg` 的 `SvgFigure` 构造函数
具有同一对象身份。每个消费模块建议统一使用一个入口；`instanceof` 检查应使用
创建该实例的入口所导出的类。

```typescript
import { figure } from 'plot-ts/svg'

const report = figure({ width: 800, height: 500 })
  .bar({ categories: ['A'], series: [{ values: [10] }] })
  .render()
```

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

### SVG 入场动画与确定性帧

`animated: true` 输出自带 CSS 的 SVG/HTML；`false` 关闭图表自身的动画。
省略时 `render()` 保留原有静态字节，`renderHtml()` 保留入场效果并改用安全、有限的动画计划。
当前作用于柱图、柱图数值标签和散点；其他图表保持静态。
`renderFrame(timeMs, { reducedMotion? })` 可生成无浏览器、无状态的确定性 SVG 帧。
全部入场在 1.6 秒内结束，最多 2048 个实际动画目标；显式动画超限报错，默认 HTML 超限整体静态回退。
完整语义、默认 HTML 兼容性变化、零基线/透明度/边界保证和原生验证范围见
[SVG entry motion](docs/svg-entry-motion.md)。真实浏览器动画验收仍是独立步骤。

### SVG 多图网格

连续添加图表会按添加顺序排入独立面板，默认采用接近正方形的网格。
每个面板使用自己的数据范围；单图仍保持原有输出。
`columns` 指定每行面板数，`gap` 指定面板间距（默认 16 px）。

```typescript
import { svg } from 'plot-ts'

const report = svg.figure({
  width: 1000, height: 760,
  title: '季度概览', columns: 2, gap: 32,
})
  .bar({ categories: ['Q1', 'Q2'], series: [{ values: [32, 45] }] })
  .line({ x: [0, 1, 2], series: [{ y: [4, 8, 6] }] })
  .donut({ items: [{ name: 'A', value: 60 }, { name: 'B', value: 40 }] })
  .scatter({ points: [{ x: 1, y: 3 }, { x: 2, y: 7 }] })

const html = report.renderHtml()
```

尺寸必须为有限正数，`columns` 必须为正整数，`gap` 必须为有限非负数。
多图面板至少需要 160×120 px（含标题时会先预留 40 px）；空间不足会抛出
`RangeError`，可增大画布或调整列数和间距。复杂标签通常需要更大的面板。
此网格最小尺寸限制不适用于单图；但所有图表的实际绘图区宽高或半径必须为正。
例如 slope 面板宽度必须大于 160 px，pyramid 必须大于 200 px，radar 的宽高必须都大于 80 px。
这些检查也适用于空数据配置。没有添加图表的空画布仍可使用任意有限正尺寸。
标题预留空间、选项相关留白和精确边界见 [SVG panel geometry](docs/svg-panel-geometry.md)。

Extreme finite SVG data must also produce representable domains and totals; see
[computed numeric-data domains](docs/svg-data-domains.md) and the
[verification report](docs/verification-svg-data-domains-2026-10-04.md).

源码目录安装开发依赖后，可运行确定性的 2×2 示例和十种图表的完整网格：

```bash
node --import tsx examples/svg-grid-demo.ts out
# 生成 out/svg-grid.svg、out/svg-grid.html、
#      out/svg-gallery.svg、out/svg-gallery.html
```

### SVG 仪表盘的数值范围

`gauge({ value: 0 })` 使用 `0..1` 的自动范围，指针停在零端点，默认色带保持可见。
显式 `max` 必须是有限正数；不会把 `max: 0` 当成省略。非有限 `value`、无效
`max` 或无法构造有限正数范围时会在渲染时抛出 `RangeError`。负数 `value` 需要
显式正数 `max`；显式范围外的有限值仍按原有行为将指针限制在两端，数值标签不变。

### SVG 符号与选项契约

SVG 的 donut/radar 仅接受非负数值；显式 radar 最大值必须为正有限数，gauge 自定义区间必须满足
`0 <= from <= to <= max`。负值和无效选项现在会在 `render()` 时抛出明确错误；这是有意的契约变更。
详见 [SVG 数据与选项边界](docs/svg-data-validation.md)。

### SVG 金字塔的零值图层

`pyramid` 的图层值必须是有限非负数；负数和非有限值会在渲染时抛出 `RangeError`。
非空的全零数据使用 `0..1` 范围，每层保留名称和零值标签，居中的矩形宽度为零，
不绘制正面积的数据块。正数图层仍使用原有的自动上界；无法构造有限正数范围时
抛出 `RangeError`。空图层列表继续输出空图。

---

### SVG heatmap column labels

`figure().heatmap({ data, xLabels, yLabels })` renders each provided X label
centered below its data column, using the existing 24px bottom margin. Fewer
labels leave the remaining columns unlabeled; extra X labels are ignored. Text
is XML-escaped. Omitted X labels keep the existing 2px margin, while `xLabels: []`
retains the existing 24px layout without text. Extra Y labels are also ignored.

Long heatmap labels are abbreviated with an ellipsis; their complete escaped
text is retained in a nested SVG `<title>`. Y-label space is capped at 40% of the
width remaining after the right margin, and X labels fit their column band.
The fit estimate is approximate and preserves ordinary labels unchanged. Labels
too narrow to fit even an ellipsis retain only their full-text title. See the
[bounded label layout policy](docs/svg-heatmap-layout.md) for exact budgets,
Unicode handling, and limitations.

---

### SVG heatmap colormaps

The SVG heatmap honors `colormap: 'viridis' | 'plasma' | 'blues'`. Omitted or
`'viridis'` keeps the original SVG colors exactly. The other choices reuse the
existing discrete `COLORS.plasma` and `COLORS.blues` arrays in `src/style/palette.ts`;
they are not continuous interpolated color scales. Normalized values select the
nearest palette index; a constant field selects the middle index (the upper of
two middle entries for an even-length palette). Unsupported runtime names throw
`RangeError`, including when the matrix is empty.

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
npm test            # 源码回归测试
npm run lint        # TypeScript 类型检查
npm run build       # 浏览器 ESM/UMD/IIFE + 独立 SVG ESM + 类型声明
npm run test:package # 重新构建、打包，再在干净的消费项目中检查导出/类型/渲染
npm run dev         # 开发服务器 (Vite)
```

提交前运行 `npm test`、`npm run lint` 和 `npm run test:package`。包级检查使用本地
`npm pack --ignore-scripts` 与系统 `tar`，不发布包或下载依赖；先验证无运行时依赖的 SVG
入口，再为统一入口连接已安装的 ECharts。浏览器真实渲染不属于这些无头回归检查。

Native dependency acceptance is an explicit, separate check: after building, run
`node --test tests/native-canvas-runtime.test.mjs`. See the
[native canvas verification](docs/verification-native-canvas-2026-10-04.md) for
prerequisites, the tested Node matrix, and the boundary between pure SVG, direct
ECharts server export, and still-separate browser acceptance.

---

## Canonical themes (opt-in)

Both engines accept the same 14 pinned canonical themes, for example
`new Figure(container, { theme: 'sage-dark' })` and
`svg.figure({ theme: 'sage-dark' })`. Omitting the theme preserves legacy output.
Explicit mark colors, numerical heatmap colormaps and gauge bands keep precedence.
See [canonical theme selection, mapping and verification](docs/canonical-themes.md).

The SVG/HTML engine also accepts exact versioned `surfacePolicy` values, including
`transparent-auto-v1`, while preserving semantic marks and default output. See
[SVG automatic surfaces](docs/svg-surface-policy.md) and the separate
[Figure/ECharts surface adapter](docs/browser-surface-policy.md), including authored
background conflicts and transparent PNG export.

## 📌 技术栈

| 层 | 技术 | 说明 |
|----|------|-----|
| 浏览器渲染 | ECharts 6.x | 交互、动画、性能优秀 |
| SVG 渲染 | 纯函数实现 | 参考 ppt-gen 架构，零依赖 |
| 类型系统 | TypeScript 7.x | exactOptionalPropertyTypes |
| 构建工具 | Vite 8.x | 浏览器 ESM/UMD/IIFE + 独立 SVG ESM |
| 设计系统 | 4 色原则 + 透明度分层 | 参考麦肯锡 ppt-gen |

---

## 🙏 参考

- **ppt-gen** —— 纯 SVG 渲染、4 色设计系统、专业版式
- **Matplotlib** —— API 设计风格
- **ECharts** —— 浏览器端渲染引擎

---

**MIT License** —— 2024
