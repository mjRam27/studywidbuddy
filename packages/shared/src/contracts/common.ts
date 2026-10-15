export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: string | null;
}

export interface SkillRef {
  id: string;
  slug: string;
  name: string;
}
