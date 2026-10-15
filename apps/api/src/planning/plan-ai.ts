import { z } from 'zod/v4';
import type { PlanDraft } from '@studywidbuddy/shared';
import { findCycle, isStoryPoints } from '../tasks/task-rules';

export const MAX_PLAN_TASKS = 40;

export const PlanSchema = z.object({
  rationale: z.string().min(10).max(1500),
  milestones: z
    .array(z.object({ title: z.string().min(3).max(160), dueInDays: z.number().int().min(1).max(180) }))
    .min(1)
    .max(8),
  sprints: z
    .array(
      z.object({
        number: z.number().int().min(1).max(12),
        goal: z.string().min(5).max(300),
        durationDays: z.number().int().min(5).max(21),
      }),
    )
    .min(1)
    .max(8),
  tasks: z
    .array(
      z.object({
        key: z.string().regex(/^T\d{1,3}$/),
        title: z.string().min(3).max(200),
        description: z.string().max(2000),
        acceptanceCriteria: z.array(z.string().min(3).max(300)).min(1).max(6),
        roleKey: z.string().max(60).nullable(),
        estimate: z.number().int(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        sprintNumber: z.number().int().min(1),
        dependsOn: z.array(z.string().regex(/^T\d{1,3}$/)).max(6),
      }),
    )
    .min(3)
    .max(MAX_PLAN_TASKS),
});

/**
 * Checks the cross-references a JSON schema can't: role keys exist on the project, sprints
 * are numbered 1..n and every task points at one, keys are unique, dependencies point at real
 * tasks without cycles, and estimates are story points. Returns problems, empty when valid.
 */
export function validatePlan(plan: PlanDraft, roleKeys: Set<string>): string[] {
  const problems: string[] = [];
  const sprintNumbers = plan.sprints.map((s) => s.number).sort((a, b) => a - b);
  if (sprintNumbers.some((n, i) => n !== i + 1)) problems.push('Sprints must be numbered 1, 2, 3… without gaps.');
  const sprints = new Set(sprintNumbers);
  const keys = new Set<string>();
  for (const t of plan.tasks) {
    if (keys.has(t.key)) problems.push(`Duplicate task key ${t.key}.`);
    keys.add(t.key);
    if (t.roleKey && !roleKeys.has(t.roleKey)) problems.push(`${t.key} uses unknown role "${t.roleKey}".`);
    if (!sprints.has(t.sprintNumber)) problems.push(`${t.key} is in sprint ${t.sprintNumber}, which isn't planned.`);
    if (!isStoryPoints(t.estimate)) problems.push(`${t.key} estimate ${t.estimate} isn't 1, 2, 3, 5, 8 or 13.`);
  }
  const edges = new Map<string, string[]>();
  for (const t of plan.tasks) {
    for (const d of t.dependsOn) if (!keys.has(d)) problems.push(`${t.key} depends on unknown task ${d}.`);
    const deps = t.dependsOn.filter((d) => keys.has(d));
    const cycle = findCycle(edges, t.key, deps);
    if (cycle) problems.push(`Dependency loop: ${cycle.join(' → ')}.`);
    else edges.set(t.key, deps);
    // A task can't depend on work scheduled in a later sprint.
    for (const d of deps) {
      const dep = plan.tasks.find((x) => x.key === d)!;
      if (dep.sprintNumber > t.sprintNumber)
        problems.push(`${t.key} (sprint ${t.sprintNumber}) depends on ${d} (sprint ${dep.sprintNumber}).`);
    }
  }
  return [...new Set(problems)];
}

export interface PlanContext {
  title: string;
  problem: string;
  description: string;
  difficulty: string;
  durationWeeks: number;
  roles: { key: string; title: string; description: string; seats: number; skills: string[] }[];
  techStack: string[];
  existingTasks: string[];
}

export function planPrompt(c: PlanContext) {
  return {
    system: `You are the AI Project Manager for a simulated professional software project on StudywidBuddy. Propose a delivery plan the team will review before anything is created.

Rules:
- Split the work into ${Math.max(1, Math.round(c.durationWeeks / 2))} sprints of about two weeks, numbered from 1, plus 2–5 milestones.
- 12–${MAX_PLAN_TASKS} tasks. Each task is small enough for one person in a few days, has a clear title, a short description and 1–4 testable acceptance criteria.
- roleKey is one of: ${c.roles.map((r) => r.key).join(', ')} (or null for shared work). Balance load across roles roughly by seat count.
- estimate is story points: 1, 2, 3, 5, 8 or 13. priority is LOW, MEDIUM or HIGH.
- dependsOn lists task keys that must finish first. No loops, and never depend on a task in a later sprint.
- Task keys are T1, T2, T3… Start with foundations (repo, CI, schema, auth) in sprint 1.
- Don't duplicate tasks that already exist.
- rationale: 2–4 sentences on how you sequenced the work and the main risk.`,
    user: `<project>
Title: ${c.title}
Difficulty: ${c.difficulty}
Duration: ${c.durationWeeks} weeks
Problem: ${c.problem}
What the team builds: ${c.description}
Tech stack: ${c.techStack.join(', ')}
</project>

<roles>
${c.roles.map((r) => `- ${r.key} (${r.title} ×${r.seats}): ${r.description}. Skills: ${r.skills.join(', ') || 'n/a'}`).join('\n')}
</roles>

<existing_tasks>
${c.existingTasks.length ? c.existingTasks.map((t) => `- ${t}`).join('\n') : 'none'}
</existing_tasks>

Propose the plan.`,
  };
}
