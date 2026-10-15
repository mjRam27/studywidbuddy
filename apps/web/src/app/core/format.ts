import { LEVEL_LABEL, type ApplicationStatus, type SkillLevel } from '@studywidbuddy/shared';

export const levelLabel = (l: SkillLevel) => LEVEL_LABEL[l];
export const levelClass = (l: SkillLevel) => l.toLowerCase();
export const levelBars = (l: SkillLevel) => ({ BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 })[l];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? ''))).toUpperCase();
}

/** Stable avatar colours from the design palette, keyed by a user id or name. */
const AVATAR_COLORS: [bg: string, fg: string][] = [
  ['#FDE9D6', '#9A4A0A'],
  ['#E0EEFC', '#1F5D99'],
  ['#E2F4E4', '#24733A'],
  ['#FBE3EC', '#9D2452'],
  ['#F1E4FB', '#7A2F9E'],
  ['#D7F1F6', '#0B6F88'],
  ['#E3E0FB', '#4B3BB8'],
  ['#FBEBD0', '#8A5A0B'],
];
export function avatarColors(key: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return { bg, fg };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2 * 86_400) return 'Yesterday';
  if (diff < 7 * 86_400) return new Date(iso).toLocaleDateString('en', { weekday: 'short' });
  return shortDate(iso);
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

interface StatusView {
  label: string;
  icon: string;
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
}

/** Application statuses: always icon + label, never colour alone. */
export const APPLICATION_STATUS: Record<ApplicationStatus, StatusView> = {
  SUBMITTED: { label: 'CV screening', icon: 'description', tone: 'info' },
  INTERVIEW_PENDING: { label: 'Voice interview unlocked', icon: 'record_voice_over', tone: 'info' },
  INTERVIEW_IN_PROGRESS: { label: 'Interview in progress', icon: 'pending', tone: 'warn' },
  UNDER_REVIEW: { label: 'Evaluating interview', icon: 'hourglass_top', tone: 'warn' },
  SELECTED: { label: 'On the team', icon: 'groups', tone: 'ok' },
  REJECTED: { label: 'Not selected', icon: 'do_not_disturb_on', tone: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', icon: 'undo', tone: 'neutral' },
};

/** The five-dot application progress used on Project Discovery. */
export function applicationSteps(status: ApplicationStatus): number {
  return {
    SUBMITTED: 1,
    INTERVIEW_PENDING: 1,
    INTERVIEW_IN_PROGRESS: 2,
    UNDER_REVIEW: 3,
    SELECTED: 4,
    REJECTED: 3,
    WITHDRAWN: 0,
  }[status];
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`;
}
