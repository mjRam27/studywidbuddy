/**
 * Team selection: a pure, deterministic and explainable assignment of candidates to role
 * seats. It does NOT sort by overall score and take the top N. It:
 *   1. scores every (candidate, role) pair on interview result, skill coverage against the
 *      role's requirements, role preference and availability;
 *   2. fills the hardest-to-fill roles first (fewest eligible candidates per seat), so a
 *      strong generalist doesn't take the only seat a specialist could fill;
 *   3. within a role, adds a small bonus for covering required skills the already-picked
 *      members of that role don't cover, for a balanced team;
 *   4. records the reasons behind every decision.
 */

export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
const RANK: Record<Level, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

export interface RoleInput {
  id: string;
  title: string;
  seats: number;
  requiredSkills: { skillId: string; name: string; minLevel: Level }[];
}

export interface CandidateInput {
  applicationId: string;
  userId: string;
  name: string;
  appliedRoleId: string;
  recommendedRoleId: string | null;
  hoursPerWeek: number;
  /** null when the candidate has no evaluation yet. */
  evaluation: { overall: number; technical: number } | null;
  /** Best level per skill, and whether a finished course/project proves it. */
  skills: Map<string, { level: Level; proven: boolean }>;
}

export interface SelectionConfig {
  minInterviewScore: number;
  minFit: number;
  weights: { interview: number; skills: number; preference: number; availability: number };
  diversityBonusPerSkill: number;
  targetHoursPerWeek: number;
}

export const DEFAULT_SELECTION: SelectionConfig = {
  minInterviewScore: 40,
  minFit: 0.45,
  weights: { interview: 0.4, skills: 0.3, preference: 0.2, availability: 0.1 },
  diversityBonusPerSkill: 0.05,
  targetHoursPerWeek: 10,
};

export interface Decision {
  applicationId: string;
  userId: string;
  selected: boolean;
  roleId: string | null;
  /** Fit for the assigned role, or best fit for any role when not selected (0–1). */
  fit: number;
  reasons: string[];
}

export interface SelectionResult {
  decisions: Decision[];
  unfilled: { roleId: string; title: string; open: number }[];
  summary: string;
}

interface Fit {
  value: number;
  skillsMet: string[];
  skillsMissing: string[];
}

export function roleFit(c: CandidateInput, role: RoleInput, cfg = DEFAULT_SELECTION): Fit {
  const skillsMet: string[] = [];
  const skillsMissing: string[] = [];
  let skillScore = 0;
  for (const req of role.requiredSkills) {
    const have = c.skills.get(req.skillId);
    const gap = have ? RANK[req.minLevel] - RANK[have.level] : Infinity;
    if (have && gap <= 0) {
      skillScore += have.proven ? 1 : 0.8; // proven skills count fully, self-reported slightly less
      skillsMet.push(have.proven ? `${req.name} (proven)` : req.name);
    } else if (have && gap === 1) {
      skillScore += 0.4; // one level short: partial credit
      skillsMissing.push(`${req.name} (one level below)`);
    } else {
      skillsMissing.push(req.name);
    }
  }
  const skills = role.requiredSkills.length ? skillScore / role.requiredSkills.length : 1;
  const interview = (c.evaluation?.overall ?? 0) / 100;
  const preference = c.appliedRoleId === role.id ? 1 : c.recommendedRoleId === role.id ? 0.7 : 0.3;
  const availability = Math.min(c.hoursPerWeek / cfg.targetHoursPerWeek, 1);
  const w = cfg.weights;
  const value = w.interview * interview + w.skills * skills + w.preference * preference + w.availability * availability;
  return { value: round3(value), skillsMet, skillsMissing };
}

export function selectTeam(roles: RoleInput[], candidates: CandidateInput[], cfg = DEFAULT_SELECTION): SelectionResult {
  const reasons = new Map<string, string[]>(candidates.map((c) => [c.applicationId, []]));
  const eligible = candidates.filter((c) => {
    const r = reasons.get(c.applicationId)!;
    if (!c.evaluation) {
      r.push('No completed interview evaluation.');
      return false;
    }
    if (c.evaluation.overall < cfg.minInterviewScore) {
      r.push(`Interview score ${c.evaluation.overall}/100 is below the ${cfg.minInterviewScore} minimum.`);
      return false;
    }
    return true;
  });

  const fits = new Map<string, Map<string, Fit>>();
  for (const c of eligible) fits.set(c.applicationId, new Map(roles.map((r) => [r.id, roleFit(c, r, cfg)])));
  const fitOf = (c: CandidateInput, roleId: string) => fits.get(c.applicationId)!.get(roleId)!;

  // Hardest roles first: fewest candidates who clear the bar, per seat. Ties: more seats first, then title.
  const pool = (role: RoleInput) => eligible.filter((c) => fitOf(c, role.id).value >= cfg.minFit).length;
  const order = [...roles].sort(
    (a, b) => pool(a) / a.seats - pool(b) / b.seats || b.seats - a.seats || a.title.localeCompare(b.title),
  );

  const assigned = new Map<string, { roleId: string; fit: number }>();
  const unfilled: SelectionResult['unfilled'] = [];

  for (const role of order) {
    const picked: CandidateInput[] = [];
    for (let seat = 0; seat < role.seats; seat++) {
      const coveredByRole = new Set(picked.flatMap((p) => metSkillIds(p, role)));
      let best: { c: CandidateInput; score: number; fit: number } | null = null;
      for (const c of eligible) {
        if (assigned.has(c.applicationId)) continue;
        const f = fitOf(c, role.id);
        if (f.value < cfg.minFit) continue;
        const newlyCovered = metSkillIds(c, role).filter((id) => !coveredByRole.has(id)).length;
        const score = f.value + (picked.length ? newlyCovered * cfg.diversityBonusPerSkill : 0);
        if (!best || score > best.score || (score === best.score && c.applicationId < best.c.applicationId)) {
          best = { c, score, fit: f.value };
        }
      }
      if (!best) break;
      picked.push(best.c);
      assigned.set(best.c.applicationId, { roleId: role.id, fit: best.fit });
      const f = fitOf(best.c, role.id);
      const r = reasons.get(best.c.applicationId)!;
      r.push(`Selected as ${role.title} (fit ${pct(best.fit)}).`);
      r.push(`Interview ${best.c.evaluation!.overall}/100.`);
      if (role.requiredSkills.length) {
        r.push(
          f.skillsMet.length
            ? `Meets ${f.skillsMet.length} of ${role.requiredSkills.length} required skills: ${f.skillsMet.join(', ')}.`
            : `Meets none of the ${role.requiredSkills.length} required skills yet.`,
        );
      }
      r.push(
        best.c.appliedRoleId === role.id
          ? 'Applied for this role.'
          : best.c.recommendedRoleId === role.id
            ? 'Interview recommended this role.'
            : 'Placed outside the applied role to fill a gap.',
      );
    }
    if (picked.length < role.seats)
      unfilled.push({ roleId: role.id, title: role.title, open: role.seats - picked.length });
  }

  // Explain every non-selection against the role the candidate wanted.
  for (const c of eligible) {
    if (assigned.has(c.applicationId)) continue;
    const r = reasons.get(c.applicationId)!;
    const applied = roles.find((x) => x.id === c.appliedRoleId);
    const f = applied ? fitOf(c, applied.id) : null;
    if (applied && f && f.value < cfg.minFit) {
      r.push(`Fit for ${applied.title} is ${pct(f.value)}, below the ${pct(cfg.minFit)} bar.`);
      if (f.skillsMissing.length) r.push(`Missing: ${f.skillsMissing.join(', ')}.`);
    } else if (applied) {
      const holders = [...assigned.entries()].filter(([, a]) => a.roleId === applied.id).map(([, a]) => pct(a.fit));
      r.push(
        `${applied.title} seats went to candidates with higher fit (${holders.join(', ') || 'none'} vs ${pct(f!.value)}).`,
      );
    }
  }

  const decisions: Decision[] = candidates.map((c) => {
    const a = assigned.get(c.applicationId);
    const best = fits.get(c.applicationId);
    const bestFit = best ? Math.max(...[...best.values()].map((f) => f.value)) : 0;
    return {
      applicationId: c.applicationId,
      userId: c.userId,
      selected: !!a,
      roleId: a?.roleId ?? null,
      fit: a?.fit ?? round3(bestFit),
      reasons: reasons.get(c.applicationId)!,
    };
  });

  const selectedCount = decisions.filter((d) => d.selected).length;
  const seats = roles.reduce((n, r) => n + r.seats, 0);
  const summary =
    `${selectedCount} of ${seats} seats filled from ${candidates.length} applicant${candidates.length === 1 ? '' : 's'} ` +
    `(${eligible.length} eligible).` +
    (unfilled.length
      ? ` Open: ${unfilled.map((u) => `${u.title} ×${u.open}`).join(', ')}.`
      : ' Every role is covered.');
  return { decisions, unfilled, summary };

  function metSkillIds(c: CandidateInput, role: RoleInput) {
    return role.requiredSkills
      .filter((req) => {
        const have = c.skills.get(req.skillId);
        return have && RANK[have.level] >= RANK[req.minLevel];
      })
      .map((req) => req.skillId);
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (n: number) => `${Math.round(n * 100)}%`;
