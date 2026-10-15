import type { ProjectSummary } from '@studywidbuddy/shared';
import { daysUntil } from '../../core/format';

/** Card status: always a label plus a coloured dot, never colour alone. */
export function projectStatus(p: Pick<ProjectSummary, 'status' | 'applicationDeadline'>): {
  label: string;
  cls: string;
} {
  switch (p.status) {
    case 'OPEN':
      if (p.applicationDeadline && daysUntil(p.applicationDeadline) <= 3) return { label: 'Closing soon', cls: 'soon' };
      return { label: 'Recruiting', cls: 'recruiting' };
    case 'IN_PROGRESS':
      return { label: 'In progress', cls: 'progress' };
    case 'COMPLETED':
      return { label: 'Completed', cls: 'done' };
    default:
      return { label: p.status.toLowerCase(), cls: 'done' };
  }
}

export const seatArray = (seats: number, open: number) => Array.from({ length: seats }, (_, i) => i < seats - open);
