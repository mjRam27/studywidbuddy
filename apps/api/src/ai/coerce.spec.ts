import { z } from 'zod/v4';
import { coerceToSchema, truncate } from './coerce';

const schema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(5).max(40),
  tags: z.array(z.string().max(10)).min(1).max(2),
  role: z.string().max(5).nullable(),
  nested: z.object({ n: z.number().min(1).max(3) }),
});
const json = z.toJSONSchema(schema) as Parameters<typeof coerceToSchema>[1];

describe('coerceToSchema', () => {
  it('brings over-limit values within the schema so validation passes', () => {
    const raw = {
      score: 104.6,
      summary: 'This summary is clearly much longer than forty characters allow.',
      tags: ['short', 'averyveryverylongtag', 'third'],
      role: 'backend-developer',
      nested: { n: 0 },
    };
    const fixed = coerceToSchema(raw, json);
    const parsed = schema.safeParse(fixed);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ score: 100, tags: ['short', expect.stringMatching(/…$/)], nested: { n: 1 } });
    expect(parsed.data!.summary.length).toBeLessThanOrEqual(40);
    expect(parsed.data!.role!.length).toBeLessThanOrEqual(5);
  });

  it('rounds integers and keeps valid values unchanged', () => {
    const ok = { score: 71.4, summary: 'Fine text', tags: ['a'], role: null, nested: { n: 2 } };
    expect(coerceToSchema(ok, json)).toEqual({ ...ok, score: 71 });
  });

  it('cannot invent what is missing: those still fail validation', () => {
    const missing = { score: 50, tags: [], role: null, nested: { n: 2 } };
    expect(schema.safeParse(coerceToSchema(missing, json)).success).toBe(false);
  });
});

describe('truncate', () => {
  it('cuts at a word boundary with an ellipsis', () => {
    expect(truncate('one two three four five', 14)).toBe('one two three…');
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('abcdefghijklmnop', 8)).toHaveLength(8);
  });
});
