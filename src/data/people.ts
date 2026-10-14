export type Level = 'Beginner' | 'Intermediate';
export type Language = 'English' | 'German';
export type Availability = 'Weekday evenings' | 'Weekends';
export type TimezoneBand = 'CET ±1h' | 'GMT';

export type MatchReason = { key: string; value: number; text: string };

export type Person = {
  id: string;
  initials: string;
  name: string;
  bg: string;
  fg: string;
  online: boolean;
  headline: string;
  goal: string;
  skills: string[];
  languagesLabel: string;
  languages: Language[];
  availabilityLabel: string;
  availability: Availability;
  timezone: string;
  timezoneBand: TimezoneBand;
  level: Level;
  score: number;
  why: MatchReason[];
  bio: string;
  stats: { value: string; label: string }[];
  shared: string[];
  history: string[];
};

export const people: Person[] = [
  { id: 'pn', initials: 'PN', name: 'Priya Nair', bg: '#FBE3EC', fg: '#9D2452', online: true,
    headline: 'Data Analyst moving into ML · Berlin', goal: 'Ship the RAG capstone and move into an ML engineering role',
    skills: ['Python', 'SQL', 'pandas'], languagesLabel: 'English, Hindi', languages: ['English'],
    availabilityLabel: 'Weekday evenings', availability: 'Weekday evenings', timezone: 'CET', timezoneBand: 'CET ±1h', level: 'Beginner', score: 92,
    why: [{ key: 'Level', value: 100, text: 'Both Beginner' }, { key: 'Goals', value: 90, text: 'Build projects' }, { key: 'Schedule', value: 85, text: 'Tue/Thu evenings' }, { key: 'Language', value: 100, text: 'English' }],
    bio: 'Two years of dashboards, and now I want to build the models behind them. I learn best by explaining things out loud.',
    stats: [{ value: '3', label: 'courses done' }, { value: '94%', label: 'session attendance' }, { value: '1', label: 'project' }],
    shared: ['Python', 'Build projects', 'Weekday evenings', 'CET'], history: ['Python Fundamentals', 'Statistics for Data Science'] },
  { id: 'tk', initials: 'TK', name: 'Tobias Krüger', bg: '#E0EEFC', fg: '#1F5D99', online: false,
    headline: 'Backend developer · Hamburg', goal: 'Add LLM features to the product I work on',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'], languagesLabel: 'German, English', languages: ['English', 'German'],
    availabilityLabel: 'Weekend mornings', availability: 'Weekends', timezone: 'CET', timezoneBand: 'CET ±1h', level: 'Beginner', score: 84,
    why: [{ key: 'Level', value: 100, text: 'Both Beginner' }, { key: 'Goals', value: 70, text: 'Improve skills' }, { key: 'Schedule', value: 55, text: 'Weekends only' }, { key: 'Language', value: 100, text: 'English, German' }],
    bio: "Backend dev for five years. My team wants AI features and I want to understand what I'd be shipping.",
    stats: [{ value: '2', label: 'courses done' }, { value: '88%', label: 'session attendance' }, { value: '0', label: 'projects' }],
    shared: ['TypeScript', 'PostgreSQL', 'German', 'CET'], history: ['Databases · Intermediate'] },
  { id: 'ms', initials: 'MS', name: 'Mei Sato', bg: '#F1E4FB', fg: '#7A2F9E', online: true,
    headline: 'CS student · Tokyo → Munich exchange', goal: 'University support for her ML elective plus a portfolio project',
    skills: ['Python', 'Linear algebra', 'Git'], languagesLabel: 'English, Japanese', languages: ['English'],
    availabilityLabel: 'Weekday evenings', availability: 'Weekday evenings', timezone: 'CET', timezoneBand: 'CET ±1h', level: 'Beginner', score: 79,
    why: [{ key: 'Level', value: 100, text: 'Both Beginner' }, { key: 'Goals', value: 60, text: 'University + build' }, { key: 'Schedule', value: 80, text: 'Mon/Wed evenings' }, { key: 'Language', value: 100, text: 'English' }],
    bio: 'Exchange student in Munich this semester. I have an ML elective and want a partner to keep me honest.',
    stats: [{ value: '1', label: 'course done' }, { value: '—', label: 'new member' }, { value: '0', label: 'projects' }],
    shared: ['Python', 'Weekday evenings', 'English'], history: ['Git & Collaboration'] },
  { id: 'jo', initials: 'JO', name: 'James Okafor', bg: '#E2F4E4', fg: '#24733A', online: false,
    headline: 'Career changer, ex-teacher · London', goal: 'Learn fundamentals and prepare for interviews',
    skills: ['Python', 'JavaScript'], languagesLabel: 'English', languages: ['English'],
    availabilityLabel: 'Weekday evenings', availability: 'Weekday evenings', timezone: 'GMT', timezoneBand: 'GMT', level: 'Intermediate', score: 71,
    why: [{ key: 'Level', value: 60, text: 'One step ahead' }, { key: 'Goals', value: 65, text: 'Interviews' }, { key: 'Schedule', value: 75, text: 'Evenings, −1h' }, { key: 'Language', value: 100, text: 'English' }],
    bio: "Taught maths for eight years and now I'm retraining. Patient, organised, and I always bring snacks to calls.",
    stats: [{ value: '4', label: 'courses done' }, { value: '97%', label: 'session attendance' }, { value: '1', label: 'project' }],
    shared: ['Python', 'Weekday evenings', 'English'], history: ['Python Fundamentals', 'JavaScript Basics'] },
];

export const firstName = (p: Person) => p.name.split(' ')[0];
