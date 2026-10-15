/**
 * The overall score is computed here from fixed weights, never taken from the model, so
 * it is consistent across evaluations and auditable.
 */
export const SCORE_WEIGHTS = {
  technicalScore: 0.4,
  problemSolvingScore: 0.25,
  communicationScore: 0.15,
  projectFitScore: 0.2,
} as const;

export type SubScores = Record<keyof typeof SCORE_WEIGHTS, number>;

export function overallScore(s: SubScores): number {
  const raw = (Object.keys(SCORE_WEIGHTS) as (keyof SubScores)[]).reduce(
    (sum, k) => sum + clampScore(s[k]) * SCORE_WEIGHTS[k],
    0,
  );
  return Math.round(raw);
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** CV (ATS) score weights. The total decides who is invited to interview, so code computes it. */
export const ATS_WEIGHTS = {
  skillsScore: { weight: 0.4, label: 'Required skills' },
  experienceScore: { weight: 0.25, label: 'Relevant experience' },
  keywordsScore: { weight: 0.15, label: 'Role keywords' },
  projectsScore: { weight: 0.1, label: 'Projects & outcomes' },
  clarityScore: { weight: 0.1, label: 'Clarity & structure' },
} as const;

export type AtsSubScores = Record<keyof typeof ATS_WEIGHTS, number>;

export function atsScore(s: AtsSubScores): number {
  const raw = (Object.keys(ATS_WEIGHTS) as (keyof AtsSubScores)[]).reduce(
    (sum, k) => sum + clampScore(s[k]) * ATS_WEIGHTS[k].weight,
    0,
  );
  return Math.round(raw);
}
