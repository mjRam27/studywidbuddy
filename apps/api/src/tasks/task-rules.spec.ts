import { ErrorCode } from '@studywidbuddy/shared';
import type { DomainError } from '../common/errors/domain-error';
import { allowedMoves, assertTaskMove, checksGate, findCycle, positionBetween } from './task-rules';

const codeOf = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as DomainError).code;
  }
};

describe('task state machine', () => {
  it('moves forward one step and can step back', () => {
    expect(codeOf(() => assertTaskMove('TODO', 'IN_PROGRESS', []))).toBeNull();
    expect(codeOf(() => assertTaskMove('IN_PROGRESS', 'REVIEW', []))).toBeNull();
    expect(codeOf(() => assertTaskMove('REVIEW', 'IN_PROGRESS', []))).toBeNull();
    expect(codeOf(() => assertTaskMove('DONE', 'IN_PROGRESS', []))).toBeNull();
  });

  it('cannot skip review', () => {
    expect(codeOf(() => assertTaskMove('IN_PROGRESS', 'DONE', []))).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    expect(codeOf(() => assertTaskMove('TODO', 'DONE', []))).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
  });

  it('cannot finish a task whose dependencies are unfinished', () => {
    expect(codeOf(() => assertTaskMove('REVIEW', 'DONE', [{ key: 'TASK-18' }]))).toBe(ErrorCode.TASK_BLOCKED);
    expect(allowedMoves('REVIEW', 1)).toEqual(['IN_PROGRESS']);
    expect(allowedMoves('REVIEW', 0)).toEqual(['IN_PROGRESS', 'DONE']);
  });

  it('treats a no-op move as fine', () => {
    expect(codeOf(() => assertTaskMove('TODO', 'TODO', []))).toBeNull();
  });
});

describe('dependency cycles', () => {
  // 24 → 18, 27 → 18, 35 → 24
  const edges = new Map([
    ['24', ['18']],
    ['27', ['18']],
    ['35', ['24']],
  ]);

  it('allows a new edge that keeps the graph acyclic', () => {
    expect(findCycle(edges, '35', ['27'])).toBeNull();
  });

  it('finds direct and indirect cycles', () => {
    expect(findCycle(edges, '18', ['24'])).toEqual(['18', '24', '18']);
    expect(findCycle(edges, '18', ['35'])).toEqual(['18', '35', '24', '18']);
    expect(findCycle(edges, '18', ['18'])).toEqual(['18', '18']);
  });
});

describe('board positions', () => {
  it('places between, before and after neighbours', () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(2048, null)).toBe(3072);
  });
});

describe('checksGate', () => {
  it('lets tasks without pull requests through', () => expect(checksGate([])).toBeNull());
  it('blocks on failing or running checks', () => {
    expect(checksGate([{ number: 3, state: 'OPEN', checks: 'FAILURE' }])).toContain('failing on PR #3');
    expect(checksGate([{ number: 4, state: 'MERGED', checks: 'PENDING' }])).toContain('still running on PR #4');
  });
  it('allows passing or check-less PRs and ignores closed ones', () => {
    expect(checksGate([{ number: 5, state: 'MERGED', checks: 'SUCCESS' }])).toBeNull();
    expect(checksGate([{ number: 6, state: 'OPEN', checks: 'NONE' }])).toBeNull();
    expect(checksGate([{ number: 7, state: 'CLOSED', checks: 'FAILURE' }])).toBeNull();
  });
});
