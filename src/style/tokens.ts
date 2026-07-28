/**
 * 设计令牌 —— 借鉴 ppt-gen 项目的专业配色系统。
 *
 * 原则：**4 色，一个都不多**。层次不靠加新色，靠 ink 压在 paper 上的
 * 不同透明度浓度来区分，从而保证全图视觉统一。
 *
 *   ink  #051C2C      —— 深藏蓝：正文、标题、主数据系列
 *   accent  #00A9F0   —— 强调色：被点名的数据、徽标
 *   paper  #FFFFFF    —— 纸面：背景
 *   neutral  #E6E8EA —— 中性灰：底纹、次要数据、被比较掉的系列
 *
 * 任意时刻只启用一个 accent。强调色是唯一的「注意力钩子」。
 */

import type { Html } from '../util/html.js';
import { h } from '../util/html.js';

/** 一个主题恰好只有 4 个色相。 */
export interface Palette {
  /** 深藏蓝：正文、标题、主数据系列。 */
  ink: string;
  /** 强调色：被点名的数据系列、气泡标注。全篇只用于「需要被看见」的那一件事。 */
  accent: string;
  /** 纸面。 */
  paper: string;
  /** 中性灰：底纹、分隔线、被比较掉的数据系列。 */
  neutral: string;
}

/** 可选强调色 —— 都在真实商业咨询素材中出现过，任一时刻只启用一个。 */
export const ACCENTS = {
  /** 麦肯锡 Cyan，最常用的强调色。 */
  cyan: '#00A9F0',
  /** 麦肯锡 Teal，见于部分环形图。 */
  teal: '#00B2A9',
  /** 电光蓝，见于线框图与部分封面。 */
  electric: '#0142F0',
  /** BCG 深绿色，用于 BCG 风格主题。 */
  bcg: '#0F7B44',
} as const;

export type AccentName = keyof typeof ACCENTS;

export const INK = '#051C2C';
export const PAPER = '#FFFFFF';
export const NEUTRAL = '#E6E8EA';

/**
 * 构造调色板。整篇报告只用一种 accent，不要在同一份文档里换色。
 * 换色 = 换品牌，读者会误以为换了另一家公司做的。
 */
export function palette(accent: AccentName = 'cyan'): Palette {
  return { ink: INK, accent: ACCENTS[accent], paper: PAPER, neutral: NEUTRAL };
}

/**
 * ink 的透明度阶梯。这些不是新颜色 —— 是同一个 ink 压在 paper 上的不同浓度，
 * 用来做次要文字与细线，从而在「只有 4 色」的约束下仍有足够层次。
 *
 * 层次从浓到淡：strong → body → muted → faint → ghost → rule → grid
 */
export const INK_ALPHA = {
  /** 正文强调、数据标签 */
  strong: 1,
  /** 正文 */
  body: 0.86,
  /** 次要说明、列小标题下的解释 */
  muted: 0.62,
  /** 轴标签、单位、页码。这些是内容不是装饰，必须能读。 */
  faint: 0.58,
  /** 脚注、出处。 */
  ghost: 0.46,
  /** 分隔线 */
  rule: 0.16,
  /** 极细网格线 */
  grid: 0.08,
} as const;

/**
 * 画布默认尺寸：1280×720 定尺（16:9，投影黄金比例）。
 * 外层用 transform: scale() 适配视口，因此内部可放心用 px。
 */
export const CANVAS = { width: 1280, height: 720 } as const;

/**
 * 版心。左右边距 ≈ 0.045 宽，标题条自 0.06 起，正文区约 0.24→0.87 高。
 */
export const FRAME = {
  padX: 58,
  padTop: 40,
  padBottom: 34,
  /** 标题下横线与正文之间的呼吸 */
  headerGap: 18,
  /** 页脚横线与正文之间的呼吸 */
  footerGap: 14,
  /** 多列之间的槽宽 */
  gutter: 26,
} as const;

/**
 * 字号阶梯（px @ 1280×720）。
 * 标题用衬线，其余全部无衬线。
 */
export const TYPE = {
  /** 眉标：全大写 + 字距，灰。 */
  kicker: { size: 11, tracking: 0.1, weight: 600, lineHeight: 1.3 },
  /** 页面主标题（论点句），衬线粗体，句首大写 */
  title: { size: 27, tracking: -0.005, weight: 700, lineHeight: 1.22 },
  /** 封面大标题 */
  display: { size: 54, tracking: -0.015, weight: 700, lineHeight: 1.08 },
  /** 章节页标题 */
  sectionTitle: { size: 40, tracking: -0.012, weight: 700, lineHeight: 1.12 },
  /** 副标题 / 图表单位行，如 "Companies working in 10 top tech trends, %" */
  subtitle: { size: 14, tracking: 0, weight: 400, lineHeight: 1.4 },
  /** 分栏小标题，无衬线粗体 */
  columnHeading: { size: 13.5, tracking: 0, weight: 700, lineHeight: 1.32 },
  /** 正文 */
  body: { size: 12, tracking: 0, weight: 400, lineHeight: 1.55 },
  /** 要点条目 */
  bullet: { size: 11.5, tracking: 0, weight: 400, lineHeight: 1.5 },
  /** 数据标签（柱顶数字） */
  dataLabel: { size: 11, tracking: 0, weight: 700, lineHeight: 1.2 },
  /** 坐标轴刻度 / 类目名 */
  axis: { size: 10, tracking: 0, weight: 400, lineHeight: 1.25 },
  /**
   * KPI 大数字。**这是全页唯一允许超过标题的字号** ——
   * 原图里 "33%" / "$1.025 trillion" / "74.9 million" 都明显压过标题。
   */
  figure: { size: 42, tracking: -0.02, weight: 700, lineHeight: 1 },
  /** 脚注、出处、页码 */
  footnote: { size: 9, tracking: 0.01, weight: 400, lineHeight: 1.35 },
} as const;

/** 字体栈：优雅降级，兼容中英文。 */
export const FONTS = {
  serif: `Georgia, 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', serif`,
  sans: `'Inter', 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif`,
} as const;

/**
 * 动效参数。原则：只做「显影」，不做「表演」。
 * 缓动曲线取自 animejs-demo 的 outQuint，出场 8px，全场 ≤ 1.6s。
 */
export const MOTION = {
  /** 全篇只用这一条缓动曲线 */
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** 唯一的例外：离场淡出用对称曲线，避免"抽走"的观感。 */
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** 元素入场时长 */
  duration: 300,
  /** 图表生长 / 细线揭示时长 */
  chartDuration: 440,
  /** 换页时长 */
  slideDuration: 300,
  /** 逐项错峰间隔。整页 build 必须收在 1.6s 内，所以宁短勿长。 */
  stagger: 55,
  /** 位移幅度：够被察觉，不够被注意。绝不从画布外飞入。 */
  rise: 8,
} as const;

/**
 * 生成图表所需的内联 CSS，包含所有动效关键帧。
 * 在浏览器端使用 SVG 渲染时可注入到文档头部。
 */
export function generateStyles(p: Palette = palette()): Html {
  return h('style', {}, `
    /* plot-ts 核心样式 */
    :root {
      --ink: ${p.ink};
      --accent: ${p.accent};
      --paper: ${p.paper};
      --neutral: ${p.neutral};
      --ink-strong: ${rgba(p.ink, INK_ALPHA.strong)};
      --ink-body: ${rgba(p.ink, INK_ALPHA.body)};
      --ink-muted: ${rgba(p.ink, INK_ALPHA.muted)};
      --ink-faint: ${rgba(p.ink, INK_ALPHA.faint)};
      --ink-ghost: ${rgba(p.ink, INK_ALPHA.ghost)};
      --ink-rule: ${rgba(p.ink, INK_ALPHA.rule)};
      --ink-grid: ${rgba(p.ink, INK_ALPHA.grid)};
    }

    .plt-accentText { color: var(--accent); }

    /* SVG 文本通用 */
    .plt-chart text {
      font-family: ${FONTS.sans};
      fill: var(--ink-body);
    }

    /* 图表入场动画 */
    .plt-grow {
      transform-origin: bottom;
      animation: plt-grow ${MOTION.chartDuration}ms ${MOTION.easeOut} forwards;
    }

    @keyframes plt-grow {
      from { transform: scaleY(0); }
      to { transform: scaleY(1); }
    }

    .plt-fade {
      animation: plt-fade ${MOTION.duration}ms ${MOTION.easeOut} forwards;
      animation-delay: calc(var(--i, 0) * ${MOTION.stagger}ms);
      opacity: 0;
    }

    @keyframes plt-fade {
      from { opacity: 0; transform: translateY(${MOTION.rise}px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .plt-chart {
      background: var(--paper);
      position: relative;
    }

    .plt-chart__unit {
      font-size: ${TYPE.subtitle.size}px;
      color: var(--ink-faint);
      margin-bottom: 4px;
    }

    .plt-chart__plot {
      position: relative;
      width: 100%;
    }

    .plt-chart__plot svg {
      display: block;
      max-width: 100%;
      height: auto;
    }
  `);
}

/** Hex 转 rgba 辅助函数 */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
