import type { JobMatchView, SkillLevel } from '@studywidbuddy/shared';

/**
 * Pure helpers for job listings: clean the feed text, find catalogue skills in it, and
 * compare a listing's skills with what a user has shown. All by code (no model calls), so
 * ingesting hundreds of listings costs nothing and every match is explainable.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** HTML from a feed → plain text with paragraph breaks. Feeds are untrusted; we never render their HTML. */
export function stripHtml(html: string, max = 20_000): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*(br|\/p|\/h[1-6]|\/div|\/ul|\/ol)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+(?=• )/g, '\n')
    .trim()
    .slice(0, max);
}

/** The same job posted by two sources has the same company, title and location. */
export const dedupeKey = (company: string, title: string, location: string) =>
  [company, title, location].map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).join('|');

/** Extra spellings per catalogue skill (lower-case name → phrases). Without an entry, the name itself is used. */
const ALIASES: Record<string, string[]> = {
  'node.js': ['node.js', 'nodejs', 'node js'],
  postgresql: ['postgresql', 'postgres'],
  kubernetes: ['kubernetes', 'k8s'],
  javascript: ['javascript', 'ecmascript'],
  react: ['react', 'react.js', 'reactjs'],
  nestjs: ['nestjs', 'nest.js'],
  css: ['css', 'css3', 'scss', 'sass', 'tailwind', 'tailwindcss'],
  rest: ['rest api', 'rest apis', 'restful'],
  websockets: ['websocket', 'websockets', 'socket.io'],
  oauth: ['oauth', 'oauth2', 'openid connect'],
  aws: ['aws', 'amazon web services'],
  'machine learning': ['machine learning', 'deep learning', 'ml engineer'],
  'llm engineering': ['llm', 'llms', 'large language model', 'large language models', 'generative ai', 'genai', 'rag'],
  'automated testing': ['automated testing', 'test automation', 'unit testing', 'unit tests', 'integration tests'],
  'application security': ['application security', 'appsec', 'owasp'],
  'ux design': ['ux design', 'ux designer', 'user experience design'],
  'system design': ['system design', 'distributed systems'],
  // Languages: only explicit requirements, not "a German company".
  german: [
    'fluent german',
    'german speaking',
    'german-speaking',
    'german skills',
    'german language',
    'deutschkenntnisse',
  ],
  english: ['fluent english', 'english speaking', 'english-speaking', 'business english', 'english skills'],
  go: ['golang'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A phrase as a whole word: "java" doesn't match "javascript", "sql" doesn't match "postgresql". */
const phrase = (p: string) => new RegExp(`(?<![\\p{L}\\p{N}_.+#-])${escape(p)}(?![\\p{L}\\p{N}_+#])`, 'iu');

export interface CatalogueSkill {
  id: string;
  name: string;
}

/** Compiles the catalogue once per sync. */
export function skillMatcher(catalogue: CatalogueSkill[]) {
  const rules = catalogue.map((s) => {
    const key = s.name.toLowerCase();
    return { id: s.id, key, patterns: (ALIASES[key] ?? [key]).map(phrase) };
  });
  /** Catalogue skill ids found in a listing. */
  return (job: { title: string; tags: string[]; description: string }): string[] => {
    const head = `${job.title}\n${job.tags.join('\n')}`;
    const body = job.description.slice(0, 10_000);
    return rules
      .filter((r) => {
        // "Go" is too common a word: only the title or tags, as a capitalised word or a tag.
        if (r.key === 'go') {
          return (
            /(?<![\p{L}\p{N}])Go(?![\p{L}\p{N}])/u.test(job.title) ||
            job.tags.some((t) => /^go(lang)?$/i.test(t.trim())) ||
            r.patterns.some((p) => p.test(head) || p.test(body))
          );
        }
        return r.patterns.some((p) => p.test(head) || p.test(body));
      })
      .map((r) => r.id);
  };
}

/** Claimed skills count for less than skills proven by finishing a course or project. */
const PROVEN_WEIGHT = 1;
const CLAIMED_WEIGHT = 0.6;

export interface ViewerSkill {
  proven: boolean;
  level: SkillLevel;
}

/**
 * How well a listing fits a user: the share of the listing's skills they have shown,
 * proven skills counting fully and claimed ones at 60%. No skills found → no score.
 */
export function matchJob(jobSkills: CatalogueSkill[], mine: Map<string, ViewerSkill>): JobMatchView {
  if (!jobSkills.length) return { score: null, matched: [], gaps: [] };
  const matched: JobMatchView['matched'] = [];
  const gaps: string[] = [];
  let points = 0;
  for (const s of jobSkills) {
    const m = mine.get(s.id);
    if (!m) {
      gaps.push(s.name);
      continue;
    }
    matched.push({ name: s.name, proven: m.proven, level: m.level });
    points += m.proven ? PROVEN_WEIGHT : CLAIMED_WEIGHT;
  }
  matched.sort((a, b) => Number(b.proven) - Number(a.proven) || a.name.localeCompare(b.name));
  gaps.sort((a, b) => a.localeCompare(b));
  return { score: Math.round((100 * points) / jobSkills.length), matched, gaps };
}
