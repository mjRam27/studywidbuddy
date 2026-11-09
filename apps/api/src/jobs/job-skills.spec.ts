import { dedupeKey, matchJob, skillMatcher, stripHtml } from './job-skills';

const catalogue = [
  'TypeScript',
  'JavaScript',
  'Java',
  'Go',
  'SQL',
  'PostgreSQL',
  'Node.js',
  'React',
  'React Native',
  'Kubernetes',
  'German',
  'REST',
  'CSS',
  'LLM Engineering',
].map((name, i) => ({ id: `s${i}`, name }));
const names = (ids: string[]) => ids.map((id) => catalogue.find((c) => c.id === id)!.name).sort();
const detect = skillMatcher(catalogue);
const job = (title: string, description = '', tags: string[] = []) => names(detect({ title, description, tags }));

describe('stripHtml', () => {
  it('keeps text and paragraph breaks, drops tags, scripts and entities', () => {
    const html =
      '<h2>Role</h2><p>Build APIs &amp; UIs</p><script>alert(1)</script><ul><li>Node</li><li>SQL&#39;s</li></ul>';
    expect(stripHtml(html)).toBe("Role\nBuild APIs & UIs\n• Node\n• SQL's");
  });
});

describe('skillMatcher', () => {
  it('matches whole words and known spellings', () => {
    expect(job('Backend Engineer', 'We use Postgres, nodejs and k8s.')).toEqual([
      'Kubernetes',
      'Node.js',
      'PostgreSQL',
    ]);
    expect(job('Engineer', 'Plain SQL and MySQL.')).toEqual(['SQL']);
  });

  it('does not match a skill inside another word', () => {
    expect(job('JavaScript developer')).toEqual(['JavaScript']);
    expect(job('PostgreSQL DBA')).toEqual(['PostgreSQL']);
  });

  it('treats "Go" carefully: title or tags, never the verb', () => {
    expect(job('Senior Go Developer')).toEqual(['Go']);
    expect(job('Backend Engineer', 'Our services are written in Golang.')).toEqual(['Go']);
    expect(job('Engineer', 'Ready to go the extra mile? Go for it!')).toEqual([]);
    expect(job('Engineer', '', ['go'])).toEqual(['Go']);
  });

  it('only counts languages when they are a stated requirement', () => {
    expect(job('Developer at a German startup')).toEqual([]);
    expect(job('Developer', 'Fluent German is required.')).toEqual(['German']);
  });

  it('keeps React and React Native apart only by phrase', () => {
    expect(job('React Native developer')).toEqual(['React', 'React Native']);
    expect(job('Frontend', 'React.js and Tailwind')).toEqual(['CSS', 'React']);
  });

  it('recognises LLM work and REST APIs by phrase', () => {
    expect(job('AI Engineer', 'Build RAG pipelines on large language models behind a REST API')).toEqual([
      'LLM Engineering',
      'REST',
    ]);
    expect(job('Engineer', 'Take a rest on Fridays')).toEqual([]);
  });
});

describe('matchJob', () => {
  const skills = [
    { id: 'a', name: 'TypeScript' },
    { id: 'b', name: 'PostgreSQL' },
    { id: 'c', name: 'Kubernetes' },
    { id: 'd', name: 'Node.js' },
  ];

  it('scores proven skills fully and claimed ones at 60%, and names the gaps', () => {
    const mine = new Map([
      ['a', { proven: true, level: 'INTERMEDIATE' as const }],
      ['b', { proven: false, level: 'BEGINNER' as const }],
      ['d', { proven: true, level: 'BEGINNER' as const }],
    ]);
    expect(matchJob(skills, mine)).toEqual({
      score: 65, // (1 + 0.6 + 1) / 4
      matched: [
        { name: 'Node.js', proven: true, level: 'BEGINNER' },
        { name: 'TypeScript', proven: true, level: 'INTERMEDIATE' },
        { name: 'PostgreSQL', proven: false, level: 'BEGINNER' },
      ],
      gaps: ['Kubernetes'],
    });
  });

  it('has no score when the listing names no catalogue skill', () => {
    expect(matchJob([], new Map())).toEqual({ score: null, matched: [], gaps: [] });
  });
});

describe('dedupeKey', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(dedupeKey('Acme GmbH', 'Backend Engineer (m/w/d)', 'Berlin')).toBe(
      dedupeKey('ACME  GmbH', 'Backend engineer m/w/d', 'berlin'),
    );
  });
});
