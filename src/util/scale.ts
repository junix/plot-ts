/**
 * 图表用的比例尺与刻度工具。纯函数，可独立测试。
 *
 * 借鉴自 ppt-gen 项目的刻度优化算法：
 * - 细阶梯：不画刻度轴时用，不浪费画布空间
 * - 轴阶梯：保证 4 等分后刻度仍是整齐数字
 */

/** 把 v 从 [d0,d1] 线性映射到 [r0,r1]。 */
export function linear(v: number, d0: number, d1: number, r0: number, r1: number): number {
  if (d1 === d0) return r0;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * 「好看的」上界阶梯（细）。
 *
 * 用于**不画刻度轴**的图（本库的默认情况）：这时上界唯一的作用是给柱子定标，
 * 阶梯越细越不浪费高度。粗阶梯只有 1/2/2.5/5/10，28.7 会被抬到 50 ——
 * 柱子只长到 57%，白扣掉四成画布。原图里最高的柱子几乎顶到面板顶部。
 */
const FINE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * 画**刻度轴**时的阶梯：每一项都能被 4 整除出最多两位小数的刻度，
 * 这样 4 等分后不会冒出 7.5 这种数。
 * （只写 1/2/2.5/5/10 是不够的 —— 120 会被抬到 200，白扣一半高度；
 *   加上 1.2 之后 120 就停在 120，刻度是 0/30/60/90/120，既整齐又不浪费。）
 */
const AXIS_STEPS = [1, 1.2, 2, 2.4, 3.2, 4, 5, 6, 8, 10];

/** 取第一个 ≥ v 的 step × 10^n。 */
export function niceCeil(v: number, steps: readonly number[] = FINE_STEPS): number {
  if (v <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = steps.find((s) => norm <= s + 1e-9) ?? 10;
  return step * mag;
}

/** 画刻度轴时用这个 —— 保证上界能被 4 整除出整齐刻度。 */
export function niceCeilForAxis(v: number): number {
  return niceCeil(v, AXIS_STEPS);
}

/** 对称地取一个好看的下界（用于含负值的瀑布/柱图）。 */
export function niceFloor(v: number, steps?: readonly number[]): number {
  if (v >= 0) return 0;
  return -niceCeil(-v, steps);
}

/** 生成 count+1 个等距刻度值（含两端）。 */
export function ticks(min: number, max: number, count = 4): number[] {
  if (count < 1 || max === min) return [min, max];
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(min + ((max - min) * i) / count);
  return out;
}

/** 数组求和，忽略 null。 */
export function sum(values: (number | null)[]): number {
  let t = 0;
  for (const v of values) if (v !== null && Number.isFinite(v)) t += v;
  return t;
}

/** 非空最大值；全空返回 0。 */
export function maxOf(values: (number | null)[]): number {
  let m = -Infinity;
  for (const v of values) if (v !== null && Number.isFinite(v) && v > m) m = v;
  return m === -Infinity ? 0 : m;
}

/** 非空最小值；全空返回 0。 */
export function minOf(values: (number | null)[]): number {
  let m = Infinity;
  for (const v of values) if (v !== null && Number.isFinite(v) && v < m) m = v;
  return m === Infinity ? 0 : m;
}

export type NumberFormat = 'plain' | 'percent' | 'compact' | 'currency';

/**
 * 数值格式化。默认去掉无意义的尾零（3.0 → 3，3.50 → 3.5），
 * 因为专业图表里的数据标签就是这个规矩（7.3 / 4.9 / 10 并存）。
 */
export function fmt(v: number | null, kind: NumberFormat = 'plain', precision?: number): string {
  if (v === null || !Number.isFinite(v)) return '';
  const round = (n: number, p: number) => {
    const s = n.toFixed(p);
    return precision === undefined ? s.replace(/\.?0+$/, '') : s;
  };
  switch (kind) {
    case 'percent':
      return `${round(v, precision ?? 1)}%`;
    case 'currency':
      return `$${group(round(v, precision ?? 0))}`;
    case 'compact': {
      const a = Math.abs(v);
      if (a >= 1e9) return `${round(v / 1e9, precision ?? 1)}B`;
      if (a >= 1e6) return `${round(v / 1e6, precision ?? 1)}M`;
      if (a >= 1e3) return `${round(v / 1e3, precision ?? 1)}K`;
      return round(v, precision ?? 0);
    }
    default:
      return group(round(v, precision ?? 1));
  }
}

/** 千分位。 */
export function group(s: string): string {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [int = '', frac] = body.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${withSep}${frac ? `.${frac}` : ''}`;
}

/** 保留 2 位小数的紧凑数字，用于 SVG 坐标，避免路径串过长。 */
export function n(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * 估算一段文字的像素宽度。
 *
 * 服务端渲染 SVG 没有 `measureText`，但布局又必须知道类目名列要留多宽 ——
 * 否则只能拍一个「宽度的 30%」这样的魔法比例，长名字被裁、短名字留一片空。
 * 这里按字符类别加权求和：CJK/全角 1.0em，大写与数字 0.6em，小写 0.5em，
 * 空格 0.28em，标点 0.3em。粗体再乘 1.05。误差约 ±6%，足够用于留白决策。
 */
export function estimateTextWidth(s: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) as number;
    if (code > 0x2e7f) em += 1.0; // CJK、全角标点、假名
    else if (ch === ' ') em += 0.28;
    else if (/[A-Z0-9%$]/.test(ch)) em += 0.6;
    else if (/[a-z]/.test(ch)) em += 0.5;
    else if (/[iljt.,;:'’!|]/.test(ch)) em += 0.26;
    else em += 0.34;
  }
  return em * fontSize * (bold ? 1.05 : 1);
}

/** 最长一项的估算宽度。 */
export function widestText(items: string[], fontSize: number, bold = false): number {
  return items.reduce((m, s) => Math.max(m, estimateTextWidth(s, fontSize, bold)), 0);
}
