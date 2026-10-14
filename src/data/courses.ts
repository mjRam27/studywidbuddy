export const MAX_ACTIVE_COURSES = 4;

export type Buddy = {
  name: string;
  initials: string;
  bg: string;
  fg: string;
  online: boolean;
  /** How long the buddy has been online, shown in the page subline. */
  onlineFor?: string;
};

export type SessionTone = 'soon' | 'normal' | 'none';

export type Course = {
  id: string;
  title: string;
  category: string;
  level: string;
  progress: number;
  buddy: Buddy;
  module: string;
  next: string;
  session: string;
  sessionTone: SessionTone;
};

export const initialCourses: Course[] = [
  { id: 'ng', title: 'Angular', category: 'FRONTEND', level: 'Intermediate', progress: 62,
    buddy: { name: 'Alex Morgan', initials: 'AM', bg: '#FDE9D6', fg: '#9A4A0A', online: true, onlineFor: '12 minutes' },
    module: '4 · Dependency Injection', next: '4.4 Injection tokens', session: 'Today 19:00', sessionTone: 'soon' },
  { id: 'de', title: 'German', category: 'LANGUAGE', level: 'A2 · Elementary', progress: 41,
    buddy: { name: 'Lena Vogel', initials: 'LV', bg: '#E0EEFC', fg: '#1F5D99', online: false },
    module: '6 · Im Alltag', next: 'Speaking: at the doctor', session: 'Wed 08:00', sessionTone: 'normal' },
  { id: 'sd', title: 'System Design', category: 'ARCHITECTURE', level: 'Intermediate', progress: 78,
    buddy: { name: 'David Rossi', initials: 'DR', bg: '#E2F4E4', fg: '#24733A', online: true },
    module: '7 · Caching', next: 'Design a URL shortener', session: 'Thu 18:30', sessionTone: 'normal' },
  { id: 'ai', title: 'AI Engineering', category: 'AI', level: 'Beginner', progress: 48,
    buddy: { name: 'Priya Nair', initials: 'PN', bg: '#FBE3EC', fg: '#9D2452', online: false },
    module: '3 · Embeddings', next: 'Build a semantic search', session: 'Not scheduled', sessionTone: 'none' },
];

export const quickPicks = [
  { title: 'RxJS in Depth', note: 'pairs well with Angular' },
  { title: 'Docker Essentials', note: 'for your project' },
  { title: 'TypeScript Advanced', note: '1,204 learners' },
];

export type SessionStatus = 'confirmed' | 'awaiting';

export const upcomingSessions: { day: string; time: string; course: string; detail: string; status: SessionStatus; statusLabel: string }[] = [
  { day: 'TODAY', time: '19:00', course: 'Angular · 4.4 Injection tokens', detail: 'with Alex Morgan · Watch together', status: 'confirmed', statusLabel: 'Confirmed' },
  { day: 'WED', time: '08:00', course: 'German · Speaking practice', detail: 'with Lena Vogel · Video', status: 'confirmed', statusLabel: 'Confirmed' },
  { day: 'THU', time: '18:30', course: 'System Design · Caching', detail: 'with David Rossi · Whiteboard', status: 'awaiting', statusLabel: 'Awaiting David' },
];

export const STREAK_DAYS = 21;

/** Last 35 days, oldest first. */
export type StreakDay = 'none' | 'together' | 'solo' | 'today';
export const streak: StreakDay[] = (
  [1, 1, 2, 0, 1, 1, 1, 2, 1, 0, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 3] as const
  // 0 none · 1 together · 2 solo · 3 today
).map((v) => (['none', 'together', 'solo', 'today'] as const)[v]);

export const monthStats = [
  { value: '18.5h', label: 'studied · 72% together' },
  { value: '23', label: 'lessons completed' },
  { value: '11', label: 'coding exercises' },
  { value: '86%', label: 'quick-check accuracy' },
];

export const recentActivity = [
  { icon: 'edit_note', color: '#4B4FE0', text: 'Alex added 2 notes to "Providers & injectors"', when: '12m' },
  { icon: 'check_circle', color: '#15803D', text: 'You finished 4.3 Providers in Angular', when: '1h' },
  { icon: 'quiz', color: '#0B8FB0', text: 'Quick check on caching: 4 of 5 correct', when: 'Yesterday' },
  { icon: 'mic', color: '#4A5266', text: 'Lena sent a voice note in German', when: 'Yesterday' },
];

export const recommendations = [
  { category: 'FRONTEND · NEXT STEP', title: 'Angular Advanced', description: 'Signals, change detection internals, SSR and performance.', level: 'Advanced', duration: '6 weeks', learners: '842' },
  { category: 'FRONTEND', title: 'RxJS in Depth', description: 'Operators, higher-order streams and testing marbles.', level: 'Intermediate', duration: '4 weeks', learners: '1,390' },
  { category: 'DEVOPS', title: 'Docker Essentials', description: "Images, compose and multi-stage builds, so you're ready for project work.", level: 'Beginner', duration: '3 weeks', learners: '2,610' },
];
