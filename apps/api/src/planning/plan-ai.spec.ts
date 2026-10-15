import type { PlanDraft } from '@studywidbuddy/shared';
import { PlanSchema, validatePlan } from './plan-ai';

const t = (key: string, p: Partial<PlanDraft['tasks'][number]> = {}): PlanDraft['tasks'][number] => ({
  key,
  title: `Task ${key}`,
  description: '',
  acceptanceCriteria: ['Works'],
  roleKey: 'backend',
  estimate: 3,
  priority: 'MEDIUM',
  sprintNumber: 1,
  dependsOn: [],
  ...p,
});

const plan = (tasks: PlanDraft['tasks'], sprints = 2): PlanDraft => ({
  rationale: 'Foundations first, then features.',
  milestones: [{ title: 'MVP', dueInDays: 28 }],
  sprints: Array.from({ length: sprints }, (_, i) => ({
    number: i + 1,
    goal: `Sprint goal ${i + 1}`,
    durationDays: 14,
  })),
  tasks,
});

const roles = new Set(['backend', 'frontend']);

describe('validatePlan', () => {
  it('accepts a consistent plan', () => {
    expect(
      validatePlan(
        plan([t('T1'), t('T2', { dependsOn: ['T1'] }), t('T3', { sprintNumber: 2, dependsOn: ['T2'] })]),
        roles,
      ),
    ).toEqual([]);
  });

  it('rejects unknown roles, missing sprints and bad estimates', () => {
    const problems = validatePlan(plan([t('T1', { roleKey: 'chef', sprintNumber: 5, estimate: 4 })]), roles);
    expect(problems).toEqual([
      'T1 uses unknown role "chef".',
      "T1 is in sprint 5, which isn't planned.",
      "T1 estimate 4 isn't 1, 2, 3, 5, 8 or 13.",
    ]);
  });

  it('rejects dangling and cyclic dependencies', () => {
    expect(validatePlan(plan([t('T1', { dependsOn: ['T9'] })]), roles)).toEqual(['T1 depends on unknown task T9.']);
    const cyclic = validatePlan(plan([t('T1', { dependsOn: ['T2'] }), t('T2', { dependsOn: ['T1'] })]), roles);
    expect(cyclic.some((p) => p.startsWith('Dependency loop'))).toBe(true);
  });

  it('rejects depending on later sprints and duplicate keys', () => {
    expect(validatePlan(plan([t('T1', { dependsOn: ['T2'] }), t('T2', { sprintNumber: 2 })]), roles)).toEqual([
      'T1 (sprint 1) depends on T2 (sprint 2).',
    ]);
    expect(validatePlan(plan([t('T1'), t('T1')]), roles)).toEqual(['Duplicate task key T1.']);
  });

  it('rejects gaps in sprint numbering', () => {
    const p = plan([t('T1')]);
    p.sprints = [{ number: 2, goal: 'Only sprint two', durationDays: 14 }];
    expect(validatePlan(p, roles)).toContain('Sprints must be numbered 1, 2, 3… without gaps.');
  });
});

describe('PlanSchema', () => {
  it('requires well-formed task keys', () => {
    const bad = plan([t('task-1'), t('T2'), t('T3')]);
    expect(PlanSchema.safeParse(bad).success).toBe(false);
    expect(PlanSchema.safeParse(plan([t('T1'), t('T2'), t('T3')])).success).toBe(true);
  });
});
