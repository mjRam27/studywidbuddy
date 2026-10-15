/**
 * Rules for the voice interview's flow. The model proposes the next move; these rules have
 * the final say, so a call always ends, never loops on follow-ups, and covers the plan.
 */

/** Answers (including the introduction) before the interviewer may close. */
export const MIN_ANSWERS = 5;
/** Hard cap on answers: the interviewer must close after this many. */
export const MAX_ANSWERS = 9;
/** Hard cap on call length. */
export const MAX_CALL_MS = 30 * 60_000;

export type Move =
  | { action: 'FOLLOW_UP'; say: string }
  | { action: 'NEXT_TOPIC'; topicIndex: number; say: string }
  | { action: 'CLOSE'; say: string };

export interface FlowState {
  /** Topic indices already asked. */
  usedTopics: number[];
  topicCount: number;
  /** Answers given so far, including the one just received. */
  answers: number;
  /** Was the previous interviewer turn a follow-up? */
  lastWasFollowUp: boolean;
  startedAt: Date;
  now: Date;
}

export const remainingTopics = (s: Pick<FlowState, 'usedTopics' | 'topicCount'>) =>
  Array.from({ length: s.topicCount }, (_, i) => i).filter((i) => !s.usedTopics.includes(i));

export function mustClose(s: FlowState): boolean {
  return (
    s.answers >= MAX_ANSWERS ||
    s.now.getTime() - s.startedAt.getTime() >= MAX_CALL_MS ||
    (remainingTopics(s).length === 0 && s.answers >= MIN_ANSWERS)
  );
}

export const DEFAULT_CLOSING =
  'Thank you, that’s all my questions. I’m writing up your evaluation now, and you’ll see your feedback on your application page in a minute or two. Good luck!';

/**
 * Normalises the model's proposal. `plannedQuestion(i)` gives topic i's planned wording,
 * used whenever the model's move isn't allowed.
 */
export function nextMove(s: FlowState, proposed: Move | null, plannedQuestion: (i: number) => string): Move {
  const remaining = remainingTopics(s);
  const close = (say?: string): Move => ({ action: 'CLOSE', say: say?.trim() || DEFAULT_CLOSING });
  const next = (i?: number, say?: string): Move => {
    const idx = i !== undefined && remaining.includes(i) ? i : remaining[0];
    if (idx === undefined) return close();
    return { action: 'NEXT_TOPIC', topicIndex: idx, say: say?.trim() || plannedQuestion(idx) };
  };

  if (mustClose(s)) return close(proposed?.action === 'CLOSE' ? proposed.say : undefined);
  if (!proposed) return next();
  switch (proposed.action) {
    case 'CLOSE':
      // Too early to close while planned topics remain: ask the next one as planned.
      return remaining.length ? next(undefined) : close(proposed.say);
    case 'FOLLOW_UP':
      // At most one follow-up in a row, and never past the answer cap.
      if (s.lastWasFollowUp || s.answers + 1 >= MAX_ANSWERS) return next();
      return { action: 'FOLLOW_UP', say: proposed.say.trim() };
    case 'NEXT_TOPIC':
      return remaining.includes(proposed.topicIndex) ? next(proposed.topicIndex, proposed.say) : next();
  }
}
