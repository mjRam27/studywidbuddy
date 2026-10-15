import type { TaskPriority, TaskStatus } from '@studywidbuddy/shared';

/** Column meta from the design (icon + colour + label: status is never colour alone). */
export const STATUS_META: Record<TaskStatus, { label: string; short: string; icon: string; color: string }> = {
  BACKLOG: { label: 'Backlog', short: 'BACKLOG', icon: 'inbox', color: '#7C8497' },
  TODO: { label: 'To do', short: 'TODO', icon: 'radio_button_unchecked', color: '#A3AABB' },
  IN_PROGRESS: { label: 'In progress', short: 'IN PROGRESS', icon: 'play_circle', color: '#4CC9E6' },
  REVIEW: { label: 'In review', short: 'REVIEW', icon: 'rate_review', color: '#8186FF' },
  DONE: { label: 'Done', short: 'DONE', icon: 'check_circle', color: '#4ADE80' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; icon: string }> = {
  HIGH: { label: 'High', icon: 'keyboard_double_arrow_up' },
  MEDIUM: { label: 'Med', icon: 'drag_handle' },
  LOW: { label: 'Low', icon: 'keyboard_arrow_down' },
};

export const HEALTH_META = {
  ON_TRACK: { label: 'On track', icon: 'check_circle' },
  AT_RISK: { label: 'At risk', icon: 'warning' },
  OFF_TRACK: { label: 'Off track', icon: 'error' },
  NOT_STARTED: { label: 'Not started', icon: 'schedule' },
} as const;
