import { fail } from './json.js';
/** Private validator for our bundled, closed receipt schema subset, not a general schema engine. */
export function schemaCheck(value: unknown, raw: unknown): void {
  const schema = raw as Record<string, unknown>;
  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail('receipt_invalid');
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) fail('receipt_invalid');
  if (schema.oneOf) {
    let matches = 0;
    for (const branch of schema.oneOf as unknown[]) { try { schemaCheck(value, branch); matches++; } catch { /* other alternative */ } }
    if (matches !== 1) fail('receipt_invalid');
  }
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('receipt_invalid');
      const object = value as Record<string, unknown>, properties = schema.properties as Record<string, unknown>;
      if (Object.keys(object).some(k => !Object.hasOwn(properties, k))) fail('receipt_invalid');
      if ((schema.required as string[]).some(k => !Object.hasOwn(object, k))) fail('receipt_invalid');
      for (const k of Object.keys(object)) schemaCheck(object[k], properties[k]);
      break;
    }
    case 'array': {
      if (!Array.isArray(value) || value.length > (schema.maxItems as number) || value.length < ((schema.minItems as number | undefined) ?? 0)) fail('receipt_invalid');
      for (const item of value as unknown[]) schemaCheck(item, schema.items);
      break;
    }
    case 'string': {
      if (typeof value !== 'string') fail('receipt_invalid');
      const str = value as string;
      if (str.length > ((schema.maxLength as number | undefined) ?? Infinity) || str.length < ((schema.minLength as number | undefined) ?? 0) || (schema.pattern && !(new RegExp(schema.pattern as string)).test(str))) fail('receipt_invalid');
      break;
    }
    case 'number': case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('receipt_invalid');
      const n = value as number;
      if ((schema.type === 'integer' && !Number.isInteger(n)) || n < (schema.minimum as number) || n > (schema.maximum as number) || (schema.exclusiveMinimum !== undefined && n <= (schema.exclusiveMinimum as number))) fail('receipt_invalid');
    }
  }
}
