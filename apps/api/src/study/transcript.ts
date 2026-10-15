/** A transcript line: when it starts (seconds into the video) and what was said. */
export interface Segment {
  start: number;
  text: string;
}

const STAMP = /^\[?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\]?/;

/** "1:02:03" / "12:34" / "0:05" → seconds. */
export function toSeconds(stamp: string): number {
  return stamp
    .split(':')
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Parses a transcript copied from YouTube's "Show transcript" panel (timestamp on its own
 * line, text on the next lines) or written as "[12:34] text" / "12:34 text". Text without any
 * timestamps returns no segments (it can still be stored as plain transcript text).
 */
export function parseTranscript(raw: string): Segment[] {
  const out: Segment[] = [];
  let current: Segment | null = null;
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = STAMP.exec(trimmed);
    if (m) {
      if (current?.text) out.push(current);
      const rest = trimmed.slice(m[0].length).replace(/^[\s\-–—:]+/, '');
      current = { start: toSeconds(m[1]), text: rest };
    } else if (current) {
      current.text = current.text ? `${current.text} ${trimmed}` : trimmed;
    }
  }
  if (current?.text) out.push(current);
  // Keep order sane even if the paste was jumbled.
  return out
    .map((s) => ({ start: s.start, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text)
    .sort((a, b) => a.start - b.start);
}

/** What was said around `atSec`: by default the 2½ minutes before and 45 seconds after. */
export function windowAround(segments: Segment[], atSec: number, before = 150, after = 45): Segment[] {
  return segments.filter((s) => s.start >= atSec - before && s.start <= atSec + after);
}

/** "[mm:ss] text" lines for prompts, capped in length. */
export function transcriptText(segments: Segment[], maxChars = 6000): string {
  let out = '';
  for (const s of segments) {
    const line = `[${fmtTime(s.start)}] ${s.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out.trimEnd();
}

/** Validates stored or generated segments: numbers ascending, non-empty text, sane size. */
export function cleanSegments(input: unknown): Segment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (x): x is Segment =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as Segment).start === 'number' &&
        typeof (x as Segment).text === 'string',
    )
    .map((x) => ({ start: Math.max(0, Math.round(x.start)), text: x.text.replace(/\s+/g, ' ').trim().slice(0, 1000) }))
    .filter((x) => x.text)
    .sort((a, b) => a.start - b.start)
    .slice(0, 5000);
}
