import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Page } from '@studywidbuddy/shared';

export class CursorQuery {
  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

interface CursorKey {
  createdAt: Date;
  id: string;
}

/**
 * Keyset pagination on (createdAt desc, id desc). Callers fetch `limit + 1` rows; the extra
 * row tells us whether there is a next page.
 */
export function encodeCursor(row: CursorKey): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): CursorKey | undefined {
  if (!cursor) return undefined;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) return undefined;
  return { createdAt, id };
}

export function toPage<R extends CursorKey, T>(rows: R[], limit: number, map: (r: R) => T): Page<T> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return { items: slice.map(map), nextCursor: hasMore ? encodeCursor(slice[slice.length - 1]) : null };
}

/** Prisma `where` fragment for "rows after this cursor" in (createdAt desc, id desc) order. */
export function afterCursor(cursor: CursorKey | undefined) {
  if (!cursor) return {};
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  };
}

export const DEFAULT_PAGE_SIZE = 20;
