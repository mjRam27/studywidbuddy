/**
 * DEMO / DEVELOPMENT DATA ONLY.
 *
 * Catalogue content (skills, courses, projects) plus a handful of demo learners whose
 * emails use the reserved `demo.studywidbuddy.local` domain. Names and projects mirror the
 * design prototypes so screens can be compared side by side. Nothing here is loaded in
 * production (see seed.ts).
 */
import type { SkillCategory, SkillLevel } from '@prisma/client';

export const DEMO_EMAIL_DOMAIN = 'demo.studywidbuddy.local';

export const skills: { slug: string; name: string; category: SkillCategory }[] = [
  ['typescript', 'TypeScript', 'LANGUAGE'],
  ['javascript', 'JavaScript', 'LANGUAGE'],
  ['python', 'Python', 'LANGUAGE'],
  ['java', 'Java', 'LANGUAGE'],
  ['go', 'Go', 'LANGUAGE'],
  ['sql', 'SQL', 'LANGUAGE'],
  ['angular', 'Angular', 'FRONTEND'],
  ['rxjs', 'RxJS', 'FRONTEND'],
  ['react', 'React', 'FRONTEND'],
  ['react-native', 'React Native', 'FRONTEND'],
  ['css', 'CSS', 'FRONTEND'],
  ['nestjs', 'NestJS', 'BACKEND'],
  ['nodejs', 'Node.js', 'BACKEND'],
  ['rest', 'REST', 'BACKEND'],
  ['websockets', 'WebSockets', 'BACKEND'],
  ['oauth', 'OAuth', 'BACKEND'],
  ['stripe', 'Stripe', 'BACKEND'],
  ['kafka', 'Kafka', 'BACKEND'],
  ['postgresql', 'PostgreSQL', 'DATABASE'],
  ['redis', 'Redis', 'DATABASE'],
  ['timescaledb', 'TimescaleDB', 'DATABASE'],
  ['clickhouse', 'ClickHouse', 'DATABASE'],
  ['pgvector', 'pgvector', 'DATABASE'],
  ['docker', 'Docker', 'CLOUD_DEVOPS'],
  ['kubernetes', 'Kubernetes', 'CLOUD_DEVOPS'],
  ['aws', 'AWS', 'CLOUD_DEVOPS'],
  ['github-actions', 'GitHub Actions', 'CLOUD_DEVOPS'],
  ['terraform', 'Terraform', 'CLOUD_DEVOPS'],
  ['grafana', 'Grafana', 'CLOUD_DEVOPS'],
  ['machine-learning', 'Machine Learning', 'DATA_AI'],
  ['llm-engineering', 'LLM Engineering', 'DATA_AI'],
  ['langchain', 'LangChain', 'DATA_AI'],
  ['pandas', 'pandas', 'DATA_AI'],
  ['system-design', 'System Design', 'ARCHITECTURE'],
  ['testing', 'Automated Testing', 'OTHER'],
  ['playwright', 'Playwright', 'OTHER'],
  ['security', 'Application Security', 'OTHER'],
  ['ux-design', 'UX Design', 'OTHER'],
  ['german', 'German', 'SPOKEN_LANGUAGE'],
  ['english', 'English', 'SPOKEN_LANGUAGE'],
].map(([slug, name, category]) => ({ slug, name, category: category as SkillCategory }));

interface SeedCourse {
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  level: SkillLevel;
  estimatedHours: number;
  skills: string[];
  outcomes: string[];
  modules: { title: string; lessons: [title: string, minutes: number][] }[];
}

export const courses: SeedCourse[] = [
  {
    slug: 'angular',
    title: 'Angular',
    summary: 'Components, dependency injection, routing, forms and signals, learned by building a real app.',
    description:
      'Build a complete Angular application from the first component to a tested, routed, form-heavy app. Each module ends with an exercise you can pair on with your Study Buddy.',
    category: 'FRONTEND',
    level: 'INTERMEDIATE',
    estimatedHours: 32,
    skills: ['angular', 'typescript', 'rxjs'],
    outcomes: [
      'Structure an app with standalone components and lazy routes',
      'Use dependency injection and injection tokens deliberately',
      'Build typed reactive forms with validation',
      'Manage state with signals and RxJS where each fits',
    ],
    modules: [
      {
        title: 'Components & templates',
        lessons: [
          ['Standalone components', 14],
          ['Template syntax', 18],
          ['Inputs & outputs', 16],
        ],
      },
      {
        title: 'Control flow & pipes',
        lessons: [
          ['@if, @for and @switch', 12],
          ['Built-in pipes', 10],
          ['Writing a pipe', 14],
        ],
      },
      {
        title: 'Services',
        lessons: [
          ['Why services', 9],
          ['HttpClient basics', 17],
          ['Interceptors', 15],
        ],
      },
      {
        title: 'Dependency Injection',
        lessons: [
          ['Injectors and the tree', 16],
          ['Providers', 19],
          ['Providers & injectors', 21],
          ['Injection tokens', 18],
        ],
      },
      {
        title: 'Routing',
        lessons: [
          ['Routes and lazy loading', 15],
          ['Guards and resolvers', 17],
          ['Route parameters', 12],
        ],
      },
      {
        title: 'Forms',
        lessons: [
          ['Reactive forms', 20],
          ['Validation', 16],
          ['Dynamic forms', 18],
        ],
      },
      {
        title: 'Signals',
        lessons: [
          ['signal, computed, effect', 17],
          ['Signals with RxJS', 19],
          ['Final project', 30],
        ],
      },
    ],
  },
  {
    slug: 'german-a2',
    title: 'German',
    summary: 'A2 German for everyday life: speaking practice with a partner, grammar you actually use.',
    description:
      'Move from A1 to a confident A2. Every module pairs a short grammar lesson with speaking scenarios you practise together on video.',
    category: 'LANGUAGE',
    level: 'BEGINNER',
    estimatedHours: 40,
    skills: ['german'],
    outcomes: [
      'Hold a 5-minute everyday conversation',
      'Use the perfect tense',
      'Handle appointments, shopping and travel',
    ],
    modules: [
      {
        title: 'Wiederholung',
        lessons: [
          ['Introductions revisited', 12],
          ['Numbers and time', 14],
        ],
      },
      {
        title: 'Familie & Freunde',
        lessons: [
          ['Possessive articles', 15],
          ['Describing people', 13],
        ],
      },
      {
        title: 'Wohnen',
        lessons: [
          ['Rooms and furniture', 12],
          ['Prepositions of place', 18],
        ],
      },
      {
        title: 'Arbeit',
        lessons: [
          ['Talking about work', 14],
          ['Modal verbs', 17],
        ],
      },
      {
        title: 'Freizeit',
        lessons: [
          ['Making plans', 13],
          ['The perfect tense', 20],
        ],
      },
      {
        title: 'Im Alltag',
        lessons: [
          ['At the bakery', 11],
          ['Speaking: at the doctor', 16],
          ['Speaking: at the bank', 15],
        ],
      },
      {
        title: 'Reisen',
        lessons: [
          ['Booking a trip', 14],
          ['Final conversation', 25],
        ],
      },
    ],
  },
  {
    slug: 'system-design',
    title: 'System Design',
    summary: 'Design scalable systems step by step: storage, caching, queues and real interview problems.',
    description:
      'Learn the building blocks of large systems and practise designing them out loud with a partner on a shared whiteboard.',
    category: 'ARCHITECTURE',
    level: 'INTERMEDIATE',
    estimatedHours: 28,
    skills: ['system-design', 'postgresql', 'redis'],
    outcomes: [
      'Estimate load and storage',
      'Choose between SQL and NoSQL with reasons',
      'Design caching and queueing layers',
    ],
    modules: [
      {
        title: 'Foundations',
        lessons: [
          ['Requirements and estimates', 15],
          ['Latency numbers', 10],
        ],
      },
      {
        title: 'Storage',
        lessons: [
          ['SQL vs NoSQL', 18],
          ['Indexes', 16],
        ],
      },
      {
        title: 'Replication',
        lessons: [
          ['Leaders and followers', 17],
          ['Consistency models', 19],
        ],
      },
      {
        title: 'Partitioning',
        lessons: [
          ['Sharding strategies', 18],
          ['Hot keys', 12],
        ],
      },
      {
        title: 'Queues',
        lessons: [
          ['Async work', 14],
          ['Exactly-once myths', 16],
        ],
      },
      {
        title: 'APIs',
        lessons: [
          ['REST vs RPC', 12],
          ['Rate limiting', 15],
        ],
      },
      {
        title: 'Caching',
        lessons: [
          ['Cache-aside', 14],
          ['Invalidation', 17],
          ['Design a URL shortener', 30],
        ],
      },
      {
        title: 'Case studies',
        lessons: [
          ['Design a chat system', 30],
          ['Design a news feed', 30],
        ],
      },
    ],
  },
  {
    slug: 'ai-engineering',
    title: 'AI Engineering',
    summary: 'Build applications on top of LLMs: prompting, embeddings, retrieval and evaluation.',
    description:
      'A practical path from calling a model API to shipping a retrieval-augmented app with evaluations and guardrails.',
    category: 'AI',
    level: 'BEGINNER',
    estimatedHours: 30,
    skills: ['llm-engineering', 'python', 'pgvector'],
    outcomes: [
      'Call model APIs with structured output',
      'Build semantic search with embeddings',
      'Evaluate an LLM feature',
    ],
    modules: [
      {
        title: 'LLM basics',
        lessons: [
          ['How models generate text', 15],
          ['Tokens and context', 12],
        ],
      },
      {
        title: 'Prompting',
        lessons: [
          ['Instructions that work', 16],
          ['Structured output', 18],
        ],
      },
      {
        title: 'Embeddings',
        lessons: [
          ['What embeddings capture', 14],
          ['Similarity search', 16],
          ['Build a semantic search', 28],
        ],
      },
      {
        title: 'Retrieval',
        lessons: [
          ['Chunking', 15],
          ['RAG pipeline', 22],
        ],
      },
      {
        title: 'Evaluation',
        lessons: [
          ['Golden sets', 14],
          ['LLM-as-judge pitfalls', 16],
        ],
      },
      { title: 'Capstone', lessons: [['RAG capstone', 45]] },
    ],
  },
  {
    slug: 'rxjs-in-depth',
    title: 'RxJS in Depth',
    summary: 'Operators, higher-order streams and testing with marbles.',
    description:
      'Go beyond map and subscribe: understand flattening strategies, error handling and how to test streams.',
    category: 'FRONTEND',
    level: 'INTERMEDIATE',
    estimatedHours: 16,
    skills: ['rxjs', 'typescript'],
    outcomes: ['Pick the right flattening operator', 'Handle errors without breaking streams', 'Write marble tests'],
    modules: [
      {
        title: 'Observables',
        lessons: [
          ['Push vs pull', 12],
          ['Subjects', 14],
        ],
      },
      {
        title: 'Higher-order streams',
        lessons: [
          ['switchMap vs mergeMap', 18],
          ['exhaustMap and concatMap', 15],
        ],
      },
      {
        title: 'Testing',
        lessons: [
          ['Marble diagrams', 16],
          ['TestScheduler', 18],
        ],
      },
    ],
  },
  {
    slug: 'docker-essentials',
    title: 'Docker Essentials',
    summary: 'Images, compose and multi-stage builds, so you’re ready for project work.',
    description: 'Containerise an API and a database, then build small production images with multi-stage builds.',
    category: 'DEVOPS',
    level: 'BEGINNER',
    estimatedHours: 12,
    skills: ['docker'],
    outcomes: ['Write a Dockerfile', 'Run multi-service apps with Compose', 'Shrink images with multi-stage builds'],
    modules: [
      {
        title: 'Containers',
        lessons: [
          ['Images and containers', 12],
          ['Your first Dockerfile', 16],
        ],
      },
      {
        title: 'Compose',
        lessons: [
          ['Services and networks', 15],
          ['Volumes', 12],
        ],
      },
      {
        title: 'Production images',
        lessons: [
          ['Multi-stage builds', 17],
          ['Security basics', 14],
        ],
      },
    ],
  },
  {
    slug: 'typescript-advanced',
    title: 'TypeScript Advanced',
    summary: 'Generics, conditional and mapped types, and typing real-world APIs.',
    description: 'Make the type system work for you: model domain rules in types and keep them maintainable.',
    category: 'LANGUAGE',
    level: 'ADVANCED',
    estimatedHours: 14,
    skills: ['typescript'],
    outcomes: ['Write reusable generics', 'Use conditional and mapped types', 'Type an API client end to end'],
    modules: [
      {
        title: 'Generics',
        lessons: [
          ['Constraints', 14],
          ['Inference', 16],
        ],
      },
      {
        title: 'Type-level programming',
        lessons: [
          ['Conditional types', 18],
          ['Mapped types', 16],
        ],
      },
      { title: 'In practice', lessons: [['Typing an API client', 22]] },
    ],
  },
  {
    slug: 'angular-advanced',
    title: 'Angular Advanced',
    summary: 'Signals, change detection internals, SSR and performance.',
    description:
      'For developers comfortable with Angular who want to understand how it works underneath and make apps fast.',
    category: 'FRONTEND',
    level: 'ADVANCED',
    estimatedHours: 24,
    skills: ['angular', 'typescript'],
    outcomes: ['Explain change detection', 'Adopt zoneless signals', 'Profile and fix slow views'],
    modules: [
      {
        title: 'Change detection',
        lessons: [
          ['Zones and ticks', 16],
          ['OnPush', 14],
        ],
      },
      {
        title: 'Signals deep dive',
        lessons: [
          ['Reactive graph', 18],
          ['Zoneless', 17],
        ],
      },
      {
        title: 'Rendering',
        lessons: [
          ['SSR and hydration', 20],
          ['Deferrable views', 14],
        ],
      },
    ],
  },
];

interface SeedRole {
  key: string;
  title: string;
  description: string;
  seats: number;
  skills: [slug: string, level: SkillLevel][];
}

interface SeedProject {
  slug: string;
  category: string;
  title: string;
  summary: string;
  description: string;
  problem: string;
  difficulty: SkillLevel;
  status: 'OPEN' | 'IN_PROGRESS';
  durationWeeks: number;
  /** Days from seeding until applications close (null = no deadline). */
  deadlineInDays: number | null;
  startsInDays: number | null;
  tech: string[];
  roles: SeedRole[];
}

const role = (
  key: string,
  title: string,
  seats: number,
  description: string,
  skills: SeedRole['skills'],
): SeedRole => ({
  key,
  title,
  seats,
  description,
  skills,
});

export const projects: SeedProject[] = [
  {
    slug: 'real-time-delivery-platform',
    category: 'LOGISTICS · WEB PLATFORM',
    title: 'Real-Time Delivery Platform',
    summary:
      'Build a scalable delivery system with real-time order tracking, driver dispatch and customer notifications.',
    description:
      'A six-week simulated engagement for a logistics client. The team ships order intake, live driver tracking and notifications, working in two-week sprints with an AI project manager.',
    problem:
      'Customers call support to ask where their order is because tracking updates arrive minutes late. Dispatch assigns drivers by hand.',
    difficulty: 'INTERMEDIATE',
    status: 'IN_PROGRESS',
    durationWeeks: 6,
    deadlineInDays: null,
    startsInDays: -14,
    tech: ['nestjs', 'angular', 'postgresql', 'redis', 'docker'],
    roles: [
      role('backend', 'Backend Developer', 2, 'Order and dispatch services, auth and the realtime gateway.', [
        ['nestjs', 'INTERMEDIATE'],
        ['postgresql', 'INTERMEDIATE'],
      ]),
      role('frontend', 'Frontend Developer', 2, 'Customer tracking view and the dispatcher console.', [
        ['angular', 'INTERMEDIATE'],
        ['typescript', 'INTERMEDIATE'],
      ]),
      role('devops', 'DevOps Engineer', 1, 'CI, staging environments and observability.', [
        ['docker', 'INTERMEDIATE'],
        ['github-actions', 'BEGINNER'],
      ]),
      role('qa', 'QA Engineer', 1, 'End-to-end and load tests for the tracking flow.', [
        ['playwright', 'BEGINNER'],
        ['testing', 'INTERMEDIATE'],
      ]),
    ],
  },
  {
    slug: 'fleet-telemetry-dashboard',
    category: 'IOT · DASHBOARD',
    title: 'Fleet Telemetry Dashboard',
    summary:
      'Live map and charts for 2,000 delivery vans, covering streaming ingestion, alerting and an Angular dashboard with offline support.',
    description:
      'Ingest a high-volume telemetry stream, store it efficiently, and give operators a live dashboard that keeps working on a flaky connection.',
    problem:
      'Fleet managers find out about breakdowns from drivers’ phone calls. The data exists but nobody can see it in time.',
    difficulty: 'INTERMEDIATE',
    status: 'OPEN',
    durationWeeks: 5,
    deadlineInDays: 10,
    startsInDays: 14,
    tech: ['angular', 'typescript', 'websockets', 'timescaledb', 'grafana'],
    roles: [
      role('frontend', 'Frontend Developer', 2, 'Live map, charts and offline support.', [
        ['angular', 'INTERMEDIATE'],
        ['rxjs', 'INTERMEDIATE'],
      ]),
      role('backend', 'Backend Developer', 2, 'Ingestion, alert rules and the streaming API.', [
        ['nodejs', 'INTERMEDIATE'],
        ['websockets', 'BEGINNER'],
      ]),
      role('data', 'Data Engineer', 1, 'Time-series schema, retention and rollups.', [
        ['timescaledb', 'BEGINNER'],
        ['sql', 'INTERMEDIATE'],
      ]),
      role('qa', 'QA Engineer', 1, 'Reliability and offline tests.', [['testing', 'BEGINNER']]),
    ],
  },
  {
    slug: 'split-bill-payments-api',
    category: 'FINTECH · API',
    title: 'Split-Bill Payments API',
    summary: 'Multi-party payments with idempotent ledger writes, Stripe Connect and a fraud-check pipeline.',
    description:
      'Design a ledger that never double-charges, integrate a payment provider in test mode, and add a fraud-check stage.',
    problem: 'Friends splitting bills end up paying twice when the app retries a failed request.',
    difficulty: 'ADVANCED',
    status: 'OPEN',
    durationWeeks: 8,
    deadlineInDays: 14,
    startsInDays: 21,
    tech: ['nodejs', 'postgresql', 'stripe', 'kafka', 'kubernetes'],
    roles: [
      role('backend', 'Backend Developer', 3, 'Ledger, payment flows and idempotency.', [
        ['nodejs', 'ADVANCED'],
        ['postgresql', 'ADVANCED'],
      ]),
      role('devops', 'DevOps Engineer', 1, 'Cluster setup and deploy pipeline.', [
        ['kubernetes', 'INTERMEDIATE'],
        ['docker', 'INTERMEDIATE'],
      ]),
      role('qa', 'QA Engineer', 1, 'Contract and chaos tests for payment flows.', [['testing', 'INTERMEDIATE']]),
      role('security', 'Security Engineer', 1, 'Threat model and fraud rules.', [['security', 'INTERMEDIATE']]),
    ],
  },
  {
    slug: 'ai-travel-planner',
    category: 'AI · CONSUMER APP',
    title: 'AI Travel Planner',
    summary:
      'Plan multi-city trips with an LLM agent that books against mock APIs, with a React Native client and a RAG knowledge base.',
    description:
      'Build an agent that plans trips with tools against mock booking APIs, grounded in a retrieval knowledge base.',
    problem: 'Planning a multi-city trip means twenty browser tabs and no single view of cost and timing.',
    difficulty: 'BEGINNER',
    status: 'OPEN',
    durationWeeks: 4,
    deadlineInDays: 7,
    startsInDays: 12,
    tech: ['python', 'langchain', 'react-native', 'pgvector', 'rest'],
    roles: [
      role('ai-engineer', 'AI Engineer', 2, 'Agent tools, retrieval and evaluation.', [
        ['python', 'BEGINNER'],
        ['llm-engineering', 'BEGINNER'],
      ]),
      role('frontend', 'Frontend Developer', 2, 'Mobile client.', [['react-native', 'BEGINNER']]),
      role('backend', 'Backend Developer', 1, 'Mock booking APIs and persistence.', [['rest', 'BEGINNER']]),
      role('design', 'Product Designer', 1, 'Flows and visual design.', [['ux-design', 'BEGINNER']]),
    ],
  },
  {
    slug: 'campus-events-hub',
    category: 'EDTECH · WEB',
    title: 'Campus Events Hub',
    summary: 'An events and RSVP platform for a university, with SSO, calendar sync and an admin moderation queue.',
    description: 'A friendly first project: CRUD with real auth, calendar export and a moderation workflow.',
    problem: 'Student societies post events in six different chat groups and nobody knows what’s on.',
    difficulty: 'BEGINNER',
    status: 'OPEN',
    durationWeeks: 4,
    deadlineInDays: 12,
    startsInDays: 18,
    tech: ['angular', 'nestjs', 'postgresql', 'oauth'],
    roles: [
      role('frontend', 'Frontend Developer', 2, 'Event browsing, RSVP and admin screens.', [['angular', 'BEGINNER']]),
      role('backend', 'Backend Developer', 2, 'Events API, SSO and calendar export.', [
        ['nestjs', 'BEGINNER'],
        ['postgresql', 'BEGINNER'],
      ]),
      role('qa', 'QA Engineer', 1, 'Test plan and end-to-end tests.', [['testing', 'BEGINNER']]),
    ],
  },
  {
    slug: 'flaky-test-detector',
    category: 'DEVTOOLS · CLI',
    title: 'Flaky Test Detector',
    summary: 'A CI plugin that reruns, fingerprints and quarantines flaky tests across GitHub Actions workflows.',
    description:
      'Collect test results across runs, detect flakiness statistically and quarantine offenders automatically.',
    problem: 'Engineers rerun red builds until they pass, so real failures get ignored.',
    difficulty: 'ADVANCED',
    status: 'OPEN',
    durationWeeks: 6,
    deadlineInDays: 3,
    startsInDays: 6,
    tech: ['go', 'github-actions', 'clickhouse', 'react'],
    roles: [
      role('backend', 'Backend Developer', 2, 'Result ingestion and flake detection.', [
        ['go', 'INTERMEDIATE'],
        ['clickhouse', 'BEGINNER'],
      ]),
      role('devops', 'DevOps Engineer', 2, 'GitHub Action and rollout.', [['github-actions', 'ADVANCED']]),
      role('frontend', 'Frontend Developer', 1, 'Dashboard of flaky tests.', [['react', 'INTERMEDIATE']]),
    ],
  },
];

interface SeedUser {
  handle: string;
  name: string;
  headline: string;
  bio?: string;
  location?: string;
  timezone: string;
  languages: string[];
  admin?: boolean;
  skills: [slug: string, level: SkillLevel][];
  /** [courseSlug, level, fraction of lessons completed] */
  enrollments?: [slug: string, level: SkillLevel, done: number][];
}

export const users: SeedUser[] = [
  {
    handle: 'manoj.dev',
    name: 'Manoj Kumar',
    headline: 'Backend developer learning frontend',
    bio: 'Building things with TypeScript. Learning Angular properly this time, with a buddy.',
    location: 'Berlin',
    timezone: 'Europe/Berlin',
    languages: ['English', 'German'],
    skills: [
      ['typescript', 'INTERMEDIATE'],
      ['angular', 'BEGINNER'],
      ['nestjs', 'INTERMEDIATE'],
      ['postgresql', 'INTERMEDIATE'],
      ['nodejs', 'INTERMEDIATE'],
      ['rest', 'INTERMEDIATE'],
    ],
    enrollments: [
      ['angular', 'INTERMEDIATE', 0.62],
      ['german-a2', 'BEGINNER', 0.41],
      ['system-design', 'INTERMEDIATE', 0.78],
      ['ai-engineering', 'BEGINNER', 0.48],
    ],
  },
  {
    handle: 'alex.morgan',
    name: 'Alex Morgan',
    headline: 'Frontend developer',
    timezone: 'Europe/Berlin',
    languages: ['English'],
    skills: [
      ['angular', 'INTERMEDIATE'],
      ['typescript', 'INTERMEDIATE'],
    ],
    enrollments: [['angular', 'INTERMEDIATE', 0.6]],
  },
  {
    handle: 'lena.vogel',
    name: 'Lena Vogel',
    headline: 'UX researcher',
    timezone: 'Europe/Berlin',
    languages: ['German', 'English'],
    skills: [
      ['german', 'ADVANCED'],
      ['ux-design', 'INTERMEDIATE'],
    ],
    enrollments: [['german-a2', 'BEGINNER', 0.4]],
  },
  {
    handle: 'david.rossi',
    name: 'David Rossi',
    headline: 'Platform engineer',
    timezone: 'Europe/Rome',
    languages: ['Italian', 'English'],
    skills: [
      ['system-design', 'INTERMEDIATE'],
      ['redis', 'INTERMEDIATE'],
    ],
    enrollments: [['system-design', 'INTERMEDIATE', 0.75]],
  },
  {
    handle: 'priya.nair',
    name: 'Priya Nair',
    headline: 'Data Analyst moving into ML',
    location: 'Berlin',
    timezone: 'Europe/Berlin',
    languages: ['English', 'Hindi'],
    skills: [
      ['python', 'INTERMEDIATE'],
      ['sql', 'INTERMEDIATE'],
      ['pandas', 'INTERMEDIATE'],
    ],
    enrollments: [['ai-engineering', 'BEGINNER', 0.1]],
  },
  {
    handle: 'tobias.krueger',
    name: 'Tobias Krüger',
    headline: 'Backend developer',
    location: 'Hamburg',
    timezone: 'Europe/Berlin',
    languages: ['German', 'English'],
    skills: [
      ['typescript', 'INTERMEDIATE'],
      ['nodejs', 'INTERMEDIATE'],
      ['postgresql', 'INTERMEDIATE'],
    ],
    enrollments: [['ai-engineering', 'BEGINNER', 0]],
  },
  {
    handle: 'mei.sato',
    name: 'Mei Sato',
    headline: 'CS student',
    location: 'Munich',
    timezone: 'Europe/Berlin',
    languages: ['English', 'Japanese'],
    skills: [['python', 'BEGINNER']],
    enrollments: [['ai-engineering', 'BEGINNER', 0]],
  },
  {
    handle: 'james.okafor',
    name: 'James Okafor',
    headline: 'Career changer, ex-teacher',
    location: 'London',
    timezone: 'Europe/London',
    languages: ['English'],
    skills: [
      ['python', 'BEGINNER'],
      ['javascript', 'BEGINNER'],
    ],
    enrollments: [['ai-engineering', 'INTERMEDIATE', 0.05]],
  },
  {
    handle: 'emma.fischer',
    name: 'Emma Fischer',
    headline: 'Frontend Developer',
    timezone: 'Europe/Berlin',
    languages: ['German', 'English'],
    skills: [
      ['angular', 'ADVANCED'],
      ['rxjs', 'INTERMEDIATE'],
      ['typescript', 'ADVANCED'],
    ],
  },
  {
    handle: 'sarah.chen',
    name: 'Sarah Chen',
    headline: 'Backend engineer',
    timezone: 'Europe/Berlin',
    languages: ['English', 'Mandarin'],
    skills: [
      ['nestjs', 'INTERMEDIATE'],
      ['postgresql', 'ADVANCED'],
    ],
  },
  {
    handle: 'tomas.ortega',
    name: 'Tomás Ortega',
    headline: 'Frontend developer',
    timezone: 'Europe/Lisbon',
    languages: ['Spanish', 'English'],
    skills: [
      ['angular', 'INTERMEDIATE'],
      ['css', 'ADVANCED'],
    ],
  },
  {
    handle: 'lukas.braun',
    name: 'Lukas Braun',
    headline: 'DevOps engineer',
    timezone: 'Europe/Berlin',
    languages: ['German', 'English'],
    skills: [
      ['docker', 'ADVANCED'],
      ['github-actions', 'ADVANCED'],
      ['terraform', 'INTERMEDIATE'],
    ],
  },
  {
    handle: 'aiko.yamada',
    name: 'Aiko Yamada',
    headline: 'QA engineer',
    timezone: 'Asia/Tokyo',
    languages: ['Japanese', 'English'],
    skills: [
      ['playwright', 'ADVANCED'],
      ['testing', 'ADVANCED'],
    ],
  },
  {
    handle: 'admin',
    name: 'Demo Admin',
    headline: 'Platform administrator (demo)',
    timezone: 'Europe/Berlin',
    languages: ['English'],
    admin: true,
    skills: [],
  },
];

/**
 * DEMO workspace for "Real-Time Delivery Platform", mirroring the Project Workspace design.
 * Day offsets are relative to seeding time so the sprint is always "current".
 */
type DemoTask = [
  number: number,
  title: string,
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE',
  roleKey: string,
  assignee: string,
  priority: 'LOW' | 'MEDIUM' | 'HIGH',
  points: number,
  sprint: number,
  dependsOn: number[],
  extra: { dueInDays?: number; completedDaysAgo?: number; ai?: boolean },
];

export const deliveryWorkspace = {
  projectSlug: 'real-time-delivery-platform',
  team: [
    ['manoj.dev', 'backend'],
    ['sarah.chen', 'backend'],
    ['emma.fischer', 'frontend'],
    ['tomas.ortega', 'frontend'],
    ['lukas.braun', 'devops'],
    ['aiko.yamada', 'qa'],
  ] as [string, string][],
  milestones: [
    { title: 'Sprint 1 · Orders + auth skeleton', dueInDays: -11, done: true },
    { title: 'Sprint 2 · Realtime tracking + token rotation', dueInDays: 3, done: false },
    { title: 'Sprint 3 · Payments + hardening', dueInDays: 17, done: false },
    { title: 'Final evaluation & demo day', dueInDays: 21, done: false },
  ],
  sprints: [
    { number: 1, goal: 'Orders + auth skeleton', startInDays: -25, endInDays: -11, status: 'COMPLETED' as const },
    {
      number: 2,
      goal: 'Realtime tracking + token rotation',
      startInDays: -10,
      endInDays: 3,
      status: 'ACTIVE' as const,
    },
    { number: 3, goal: 'Payments + hardening', startInDays: 4, endInDays: 17, status: 'PLANNED' as const },
  ],
  tasks: [
    [19, 'CI pipeline with test matrix', 'DONE', 'devops', 'lukas.braun', 'MEDIUM', 3, 1, [], {}],
    [21, 'Login + signup screens', 'DONE', 'frontend', 'emma.fischer', 'MEDIUM', 5, 1, [], {}],
    [28, 'Order schema v2', 'DONE', 'backend', 'sarah.chen', 'MEDIUM', 3, 2, [], { completedDaysAgo: 3 }],
    [22, 'Auth refresh endpoint', 'REVIEW', 'backend', 'manoj.dev', 'HIGH', 5, 2, [], {}],
    [30, 'Staging deploy pipeline', 'REVIEW', 'devops', 'lukas.braun', 'MEDIUM', 5, 2, [], {}],
    [
      18,
      'Database migration: orders v2 + sessions',
      'IN_PROGRESS',
      'backend',
      'sarah.chen',
      'HIGH',
      3,
      2,
      [],
      { dueInDays: -1 },
    ],
    [24, 'Implement refresh token rotation', 'IN_PROGRESS', 'backend', 'manoj.dev', 'HIGH', 5, 2, [18], {}],
    [27, 'Driver location stream (WebSocket)', 'IN_PROGRESS', 'frontend', 'emma.fischer', 'HIGH', 8, 2, [18], {}],
    [29, 'Live map clustering', 'IN_PROGRESS', 'frontend', 'tomas.ortega', 'MEDIUM', 5, 2, [], {}],
    [31, 'Order status webhooks', 'TODO', 'backend', 'manoj.dev', 'MEDIUM', 5, 2, [], {}],
    [35, 'Auth end-to-end tests', 'TODO', 'qa', 'aiko.yamada', 'MEDIUM', 3, 2, [24], {}],
    [33, 'Add idempotency keys to POST /orders', 'BACKLOG', 'backend', 'manoj.dev', 'HIGH', 3, 3, [], { ai: true }],
    [36, 'Stripe sandbox spike for Sprint 3', 'BACKLOG', 'backend', 'sarah.chen', 'MEDIUM', 2, 3, [], { ai: true }],
    [37, 'Empty states for order history', 'BACKLOG', 'frontend', 'tomas.ortega', 'LOW', 2, 3, [], {}],
  ] as DemoTask[],
  descriptions: {
    24: {
      description:
        'Rotate refresh tokens on every use and invalidate the whole token family on reuse. This prevents replay if a token leaks. Store token families in the sessions table that TASK-18 creates.',
      acceptance: [
        'A new refresh token is issued on every /auth/refresh',
        'Reusing an old token revokes the family and returns 401',
        'Unit tests cover expiry, reuse and concurrent refresh',
      ],
      branch: 'feature/auth-refresh',
    },
  } as Record<number, { description: string; acceptance: string[]; branch?: string }>,
};
