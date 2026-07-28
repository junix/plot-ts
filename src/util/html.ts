/**
 * 极小的 HTML/SVG 拼装辅助 —— 只做转义与属性序列化，不引入模板引擎。
 * 借鉴自 ppt-gen 项目，避免 XSS 同时提供受控富文本。
 */

/** 已确认安全、可直接写入文档的片段。 */
export type Html = string;

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 转义文本内容。所有来自用户的字符串都必须过这里。 */
export function esc(value: unknown): Html {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
}

/**
 * 富文本：只放行四种标记，其余一律转义。
 *
 *   `**粗体**`   句中强调一个词组。
 *   `*斜体*`     仅限元信息：Illustrative / Rough estimates / 客户原话 / 变化量批注。
 *   `^上标^`     脚注编号，必须能在页脚找到对应的那一条。
 *   `[[强调]]`   把标题里一个词组染成强调色，同字号同字重。
 *
 * 与其让调用方直接拼 HTML（等于开放 XSS），不如给一个封闭的小语法。
 */
export function rich(value: string | undefined): Html {
  if (!value) return '';
  return esc(value)
    .replace(/\[\[([^\]]+)\]\]/g, '<em class="plt-accentText">$1</em>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
}

export type Attrs = Record<string, string | number | boolean | undefined | null>;

export function attrs(a: Attrs): Html {
  const out: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === false) continue;
    if (v === true) out.push(` ${k}`);
    else out.push(` ${k}="${esc(v)}"`);
  }
  return out.join('');
}

/**
 * 空元素。**必须自闭合成 `<rect />`**，不能只写 `<rect>`：
 * SVG 是 foreign content，浏览器不会替你补结束标签，未闭合的 `<rect>` 会把
 * 后面所有兄弟节点吞成自己的子节点 —— 结果就是一张图里只画出第一个图元。
 * （HTML5 允许 void 元素带斜杠，所以 br/img 一起自闭合也是合法的。）
 */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link',
  'use', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop',
]);

/** `h('div', { class: 'x' }, child1, child2)` —— children 必须已是安全 Html。 */
export function h(tag: string, a: Attrs = {}, ...children: (Html | undefined | false | null)[]): Html {
  const kids = children.filter((c): c is Html => typeof c === 'string' && c.length > 0);
  if (VOID_TAGS.has(tag) && kids.length === 0) return `<${tag}${attrs(a)} />`;
  return `<${tag}${attrs(a)}>${kids.join('')}</${tag}>`;
}

/** 拼接子片段，过滤空值。 */
export function join(...parts: (Html | undefined | false | null)[]): Html {
  return parts.filter((p): p is Html => typeof p === 'string' && p.length > 0).join('');
}

/** 把 `{a: 1, b: 'x'}` 变成 `a:1;b:x`；undefined 项跳过。 */
export function style(props: Record<string, string | number | undefined | null>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

/** 条件类名。 */
export function cls(...parts: (string | undefined | false | null)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

/** SVG 文本元素快捷方式 */
export function text(x: number, y: number, content: string, style?: {
  size?: number;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  baseline?: 'auto' | 'middle' | 'hanging';
  fill?: string;
}): Html {
  return h('text', {
    x: n(x),
    y: n(y),
    'text-anchor': style?.anchor,
    'dominant-baseline': style?.baseline,
    fill: style?.fill,
    style: styleProps({
      'font-size': style?.size ?? 11,
      'font-weight': style?.weight ?? 400,
    }),
  }, esc(content));
}

/** 样式属性辅助：转数字 px */
function styleProps(props: Record<string, string | number | undefined>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${typeof v === 'number' ? n(v) + 'px' : v}`)
    .join(';');
}

/** 保留 2 位小数的紧凑数字，用于 SVG 坐标，避免路径串过长。 */
export function n(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}
