import {
  DEBUG_LEVELS,
  type DebugExerciseSummary,
  type DebugLevel,
  type DebugProgress,
  type DebugStatus,
} from '@studywidbuddy/shared';

/** Labels shared by the Debug screens. Status is always icon + words, never colour alone. */
export const STATUS_VIEW: Record<DebugStatus, { label: string; icon: string; tone: string }> = {
  NEW: { label: 'To do', icon: 'radio_button_unchecked', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', icon: 'pending', tone: 'info' },
  SOLVED: { label: 'Solved', icon: 'check_circle', tone: 'ok' },
};

export const LEVEL_CLASS: Record<DebugLevel, string> = {
  EASY: 'easy',
  INTERMEDIATE: 'intermediate',
  HARD: 'hard',
};

/** 754 → "12 min 34 s", 3720 → "1 h 2 min". */
export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || sec < 0) return '–';
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min ${s % 60} s`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Progress over the exercises shown (e.g. one language), per level. */
export function progressFor(items: Pick<DebugExerciseSummary, 'level' | 'status'>[]): DebugProgress {
  const byLevel = Object.fromEntries(DEBUG_LEVELS.map((l) => [l, { total: 0, solved: 0 }])) as DebugProgress['byLevel'];
  for (const e of items) {
    byLevel[e.level].total++;
    if (e.status === 'SOLVED') byLevel[e.level].solved++;
  }
  return { total: items.length, solved: items.filter((e) => e.status === 'SOLVED').length, byLevel };
}
