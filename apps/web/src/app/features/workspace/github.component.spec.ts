import type { CodeReviewView } from '@studywidbuddy/shared';
import { reviewChip } from './github.component';

const review = (over: Partial<CodeReviewView>): CodeReviewView => ({
  id: 'r1',
  headSha: 'abc1234',
  status: 'POSTED',
  verdict: 'LOOKS_GOOD',
  summary: null,
  findings: [],
  filesReviewed: 1,
  filesSkipped: 0,
  skippedReason: null,
  failureReason: null,
  githubUrl: null,
  createdAt: '2026-11-04T10:00:00Z',
  postedAt: null,
  ...over,
});

describe('reviewChip', () => {
  it('labels every review state with an icon and words, not colour alone', () => {
    expect(reviewChip(review({ status: 'RUNNING', verdict: null })).label).toBe('AI reviewing');
    expect(reviewChip(review({}))).toEqual({ icon: 'check_circle', label: 'AI: looks good', cls: 'ok' });
    expect(reviewChip(review({ verdict: 'CHANGES_SUGGESTED' })).label).toBe('AI: changes suggested');
    expect(reviewChip(review({ status: 'SKIPPED', verdict: null })).label).toBe('AI skipped');
    expect(reviewChip(review({ status: 'FAILED', verdict: null })).cls).toBe('danger');
  });
});
