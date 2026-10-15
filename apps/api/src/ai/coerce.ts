/**
 * Structured outputs only enforce the *shape* of a JSON schema. Limits such as maxLength,
 * maxItems, minimum and maximum are passed to the model as hints, not guarantees (see the
 * SDK's transform-json-schema). So before strict validation we bring the model's JSON
 * within those limits: truncate long strings, drop extra list items, clamp and round
 * numbers. Anything that can't be repaired this way (missing fields, too few items, wrong
 * enum values) still fails validation.
 */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
}

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;

function accepts(s: JsonSchema, v: unknown): boolean {
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  const t = typeOf(v);
  return types.some((x) => x === t || (x === 'integer' && t === 'number'));
}

/** Cuts at a word boundary near the limit and adds an ellipsis, staying within the limit. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 1));
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function coerceToSchema(value: unknown, schema: JsonSchema): unknown {
  if (value === null || value === undefined) return value;
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const match = variants.find((alt) => accepts(alt, value));
    return match ? coerceToSchema(value, match) : value;
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const t = typeOf(value);

  if (t === 'string' && types.includes('string')) {
    const s = value as string;
    return schema.maxLength !== undefined ? truncate(s, schema.maxLength) : s;
  }
  if (t === 'number' && (types.includes('number') || types.includes('integer'))) {
    let n = value as number;
    if (!Number.isFinite(n)) return n;
    if (types.includes('integer') && !types.includes('number')) n = Math.round(n);
    if (schema.minimum !== undefined) n = Math.max(schema.minimum, n);
    if (schema.maximum !== undefined) n = Math.min(schema.maximum, n);
    return n;
  }
  if (t === 'array' && types.includes('array')) {
    let arr = value as unknown[];
    if (schema.maxItems !== undefined) arr = arr.slice(0, schema.maxItems);
    return schema.items ? arr.map((x) => coerceToSchema(x, schema.items!)) : arr;
  }
  if (t === 'object' && types.includes('object') && schema.properties) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (k in obj) out[k] = coerceToSchema(obj[k], sub);
    }
    return out;
  }
  return value;
}
