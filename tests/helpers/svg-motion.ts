/** Compare semantic marks across static SVG and motion wrappers without accepting
 * changes to geometry, paint, text, marker order, titles, or surface rectangles. */
export function semanticMarks(source: string): string[] {
  return [...source.matchAll(/<(?:rect|circle|line|path|polygon)\b[^>]*\/>|<text\b[^>]*>.*?<\/text>/gs)].map(m => m[0]
    .replace(/ class="plt-(?:grow|fade)"/g, '').replace(/ style="--i:[^"]*"/g, ''));
}

export function embeddedSvg(html: string): string {
  return html.slice(html.indexOf('<svg '), html.lastIndexOf('</svg>') + '</svg>'.length);
}
