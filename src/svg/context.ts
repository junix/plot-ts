/**
 * SVG 绘图上下文 —— 提供统一的绘图区计算、坐标转换、公共图元。
 * 借鉴 ppt-gen 的 context.js 模式，把重复逻辑抽离到这里。
 */

import type { Html } from '../util/html.js';
import { h, join, text, n } from '../util/html.js';
import { INK, INK_ALPHA, NEUTRAL, ACCENTS, type AccentName } from '../style/tokens.js';

/** 绘图区位置 */
export interface Plot {
  x0: number;
  y0: number;
  w: number;
  h: number;
  inset: { top: number; right: number; bottom: number; left: number };
}

/** 系列语气 —— 决定颜色 */
export type Tone = 'ink' | 'accent' | 'neutral' | 'faint';

export interface SeriesTone {
  color: string;
  opacity: number;
}

/**
 * 根据系列序号自动分配语气：
 * - 0: ink（深藏蓝，主数据）
 * - 1: accent（强调色，被点名的数据）
 * - 2: neutral（中性灰，被比较掉的数据）
 * - 3+: ink 降透明度，不引入新色相
 *
 * 这是专业图表的关键：系列数增加时，**不加新色**，而是降现有颜色的浓度。
 * 专业图绝不会出现 5、6、7 种色相。
 */
export function seriesTone(index: number, accentName: AccentName = 'cyan'): SeriesTone {
  switch (index) {
    case 0: return { color: INK, opacity: 1 };
    case 1: return { color: ACCENTS[accentName], opacity: 1 };
    case 2: return { color: NEUTRAL, opacity: 1 };
    default: return { color: INK, opacity: 0.5 - Math.min(0.3, (index - 3) * 0.05) };
  }
}

/**
 * 定义绘图区，返回绝对坐标边界。
 * inset 单位是 px，分别定义上、右、下、左的留白。
 */
export function plot(
  width: number,
  height: number,
  inset: { top?: number; right?: number; bottom?: number; left?: number }
): Plot {
  const { top = 0, right = 0, bottom = 0, left = 0 } = inset;
  return {
    x0: left,
    y0: top,
    w: Math.max(0, width - left - right),
    h: Math.max(0, height - top - bottom),
    inset: { top, right, bottom, left },
  };
}

/** 数值 v 从值域 [min, max] 映射到绘图区 Y 坐标（Y 向下增长，所以最大值在上方）。 */
export function yOf(p: Plot, v: number, min: number, max: number): number {
  if (max === min) return p.y0 + p.h / 2;
  return p.y0 + p.h - ((v - min) / (max - min)) * p.h;
}

/** 数值 v 从值域 [min, max] 映射到绘图区 X 坐标。 */
export function xOf(p: Plot, v: number, min: number, max: number): number {
  if (max === min) return p.x0 + p.w / 2;
  return p.x0 + ((v - min) / (max - min)) * p.w;
}

/** 生成 SVG 根标签。 */
export function svg(width: number, height: number, children: Html, attrs: Record<string, string> = {}): Html {
  return h('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    ...attrs,
  }, children);
}

/** 绘制水平网格线。 */
export function gridLines(p: Plot, min: number, max: number, count = 4): Html {
  const step = (max - min) / count;
  const lines: Html[] = [];

  for (let i = 1; i < count; i++) {
    const v = min + step * i;
    const y = yOf(p, v, min, max);
    lines.push(h('line', {
      x1: n(p.x0),
      x2: n(p.x0 + p.w),
      y1: n(y),
      y2: n(y),
      stroke: INK,
      'stroke-opacity': INK_ALPHA.grid,
      'stroke-width': 1,
    }));
  }

  return join(...lines);
}

/** 绘制 Y 轴刻度标签（左侧）。 */
export function yAxisLabels(p: Plot, min: number, max: number, count = 4): Html {
  const step = (max - min) / count;
  const labels: Html[] = [];

  for (let i = 0; i <= count; i++) {
    const v = min + step * i;
    const y = yOf(p, v, min, max);
    labels.push(text(
      p.x0 - 4,
      y + 4,
      String(v),
      { size: 10, anchor: 'end', fill: `rgba(5, 28, 44, ${INK_ALPHA.faint})` }
    ));
  }

  return join(...labels);
}

/** 绘制分类柱图底部的类别标签。 */
export function categoryLabels(p: Plot, categories: string[]): Html {
  const band = p.w / Math.max(1, categories.length);
  const labels: Html[] = [];

  categories.forEach((cat, i) => {
    const cx = p.x0 + band * (i + 0.5);
    labels.push(text(
      cx,
      p.y0 + p.h + 18,
      cat,
      { size: 10, anchor: 'middle', fill: `rgba(5, 28, 44, ${INK_ALPHA.faint})` }
    ));
  });

  return join(...labels);
}

/** 绘制 Y 轴基线（零值线）。 */
export function baseline(p: Plot, min: number, max: number): Html {
  const y = yOf(p, Math.max(min, 0), min, max);
  return h('line', {
    x1: n(p.x0),
    x2: n(p.x0 + p.w),
    y1: n(y),
    y2: n(y),
    stroke: INK,
    'stroke-opacity': INK_ALPHA.rule,
    'stroke-width': 1,
  });
}

/** 从 (x, y) 到 (tx, ty) 的引线。 */
export function leader(x: number, y: number, tx: number, ty: number, color: string = INK): Html {
  return h('line', {
    x1: n(x),
    y1: n(y),
    x2: n(tx),
    y2: n(ty),
    stroke: color,
    'stroke-width': 1,
    'stroke-opacity': INK_ALPHA.rule,
    'stroke-dasharray': '2,2',
  });
}

/** 标注用的圆角药丸气泡。 */
export function calloutPill(x: number, y: number, label: string, color: string = ACCENTS.cyan): Html {
  const textW = label.length * 6.5 + 16;
  return join(
    h('rect', {
      x: n(x - textW / 2),
      y: n(y - 10),
      width: n(textW),
      height: 20,
      rx: 10,
      ry: 10,
      fill: color,
      opacity: 0.9,
    }),
    text(x, y + 4, label, { size: 10, weight: 700, anchor: 'middle', fill: '#fff' })
  );
}

/** 参考线（水平线）。 */
export function refLine(p: Plot, value: number, label: string, color: string = ACCENTS.cyan): Html {
  const y = yOf(p, value, 0, value * 2); // FIXME: 需要传入真实值域
  return join(
    h('line', {
      x1: n(p.x0),
      x2: n(p.x0 + p.w),
      y1: n(y),
      y2: n(y),
      stroke: color,
      'stroke-width': 2,
      'stroke-dasharray': '4,4',
    }),
    text(p.x0 + p.w, y - 6, label, { size: 10, weight: 600, anchor: 'end', fill: color })
  );
}

/** SVG 元素淡入动画包装。 */
export function fadeIn(i: number, body: Html): Html {
  return h('g', { class: 'plt-fade', style: `--i:${i}` }, body);
}
