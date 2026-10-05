/** Bounded duplicate-aware JSON. No reviver/eval or user code. */
export class ProviderError extends Error {
  constructor(public readonly code: string, public readonly field = '$') { super(`${code} at ${field}`); }
}
export const fail = (code: string, field = '$'): never => { throw new ProviderError(code, field); };
// V2 may attribute invalid text only to fixed unit fields. Default V1 diagnostics
// remain unchanged; arbitrary input property names are never echoed.
export function parseJson(bytes: Uint8Array, maxBytes = 4 * 1024 * 1024, unitFields = false): unknown {
  if (bytes.byteLength > maxBytes) fail('byte_limit');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('invalid_json');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('invalid_utf8'); }
  let at = 0, nodes = 0;
  const node = () => { if (++nodes > 131072) fail('node_limit'); };
  const ws = () => { while (at < source.length && /[\x20\t\r\n]/.test(source[at]!)) at++; };
  const string = (field = '$'): string => {
    const start = at++;
    while (at < source.length) {
      const c = source[at++];
      if (c === '"') {
        let value: string;
        try { value = JSON.parse(source.slice(start, at)) as string; } catch { return fail('invalid_json'); }
        validateText(value, field);
        return value;
      }
      if (c === '\\') at++;
      if (at - start > 24578) fail('string_limit');
    }
    return fail('invalid_json');
  };
  const value = (depth: number, path = '$'): unknown => {
    node(); ws();
    const c = source[at];
    if (c === '"') return string(unitFields && /^\$\.charts\[\d+\]\.(?:unit|xUnit)$/.test(path) ? path : '$');
    if (c === '{' || c === '[') {
      if (++depth > 16) fail('depth_limit');
      at++; ws();
      if (c === '[') {
        const array: unknown[] = [];
        if (source[at] === ']') { at++; return array; }
        for (;;) {
          if (array.length >= 16384) fail('array_limit');
          array.push(value(depth, unitFields && path === '$.charts' ? `${path}[${array.length}]` : '$')); ws();
          if (source[at] === ']') { at++; return array; }
          if (source[at++] !== ',') fail('invalid_json');
        }
      }
      const object: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (source[at] === '}') { at++; return object; }
      for (;;) {
        ws(); if (source[at] !== '"') fail('invalid_json'); node();
        const key = string();
        if (Object.hasOwn(object, key)) fail('duplicate_key');
        ws(); if (source[at++] !== ':') fail('invalid_json');
        const child = unitFields && path === '$' && depth === 1 && key === 'charts' ? '$.charts'
          : unitFields && /^\$\.charts\[\d+\]$/.test(path) && (key === 'unit' || key === 'xUnit') ? `${path}.${key}` : '$';
        object[key] = value(depth, child); ws();
        if (source[at] === '}') { at++; return object; }
        if (source[at++] !== ',') fail('invalid_json');
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(at));
    if (!match) return fail('invalid_json');
    at += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) fail('nonfinite_number');
    return result;
  };
  const result = value(0); ws();
  if (at !== source.length) fail('invalid_json');
  return result;
}
export function validateText(value: string, field: string): string {
  if (Buffer.byteLength(value) > 4096) fail('string_limit', field);
  let count = 0;
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    if (++count > 1024) fail('string_limit', field);
    if (!(cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xd7ff) ||
      (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff))) fail('invalid_xml_text', field);
  }
  return value;
}
export function object(value: unknown, keys: readonly string[], required: readonly string[], field: string,
  unsupported: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('expected_object', field);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (unsupported.includes(key)) fail('unsupported_option', `${field}.${key}`);
    if (!keys.includes(key)) fail('unknown_field', field);
  }
  for (const key of required) if (!Object.hasOwn(result, key)) fail('missing_field', `${field}.${key}`);
  return result;
}
