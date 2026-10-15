import { decodeCursor, encodeCursor, toPage } from './pagination';

describe('cursor pagination', () => {
  const row = (i: number) => ({ id: `id-${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });

  it('round-trips a cursor', () => {
    const r = row(5);
    expect(decodeCursor(encodeCursor(r))).toEqual(r);
  });

  it('ignores garbage cursors instead of throwing', () => {
    expect(decodeCursor('not-a-cursor')).toBeUndefined();
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('uses the extra row to detect a next page', () => {
    const rows = [row(3), row(2), row(1)];
    const page = toPage(rows, 2, (r) => r.id);
    expect(page.items).toEqual(['id-3', 'id-2']);
    expect(decodeCursor(page.nextCursor!)).toEqual(row(2));
    expect(toPage(rows, 3, (r) => r.id).nextCursor).toBeNull();
  });
});
