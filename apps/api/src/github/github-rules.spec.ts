import { createHmac } from 'node:crypto';
import { repoName } from './github.service';
import { checksFrom, taskNumberFrom, verifySignature } from './webhook.service';

describe('verifySignature', () => {
  const body = Buffer.from('{"action":"opened"}');
  const sig = (secret: string, b = body) => `sha256=${createHmac('sha256', secret).update(b).digest('hex')}`;

  it('accepts the right signature over the exact bytes', () => {
    expect(verifySignature('s3cret', body, sig('s3cret'))).toBe(true);
  });
  it('rejects a wrong secret, changed body, missing or malformed header', () => {
    expect(verifySignature('s3cret', body, sig('other'))).toBe(false);
    expect(verifySignature('s3cret', Buffer.from('{"action":"closed"}'), sig('s3cret'))).toBe(false);
    expect(verifySignature('s3cret', body, undefined)).toBe(false);
    expect(verifySignature('s3cret', body, 'sha1=abc')).toBe(false);
    expect(verifySignature('s3cret', body, 'sha256=short')).toBe(false);
  });
});

describe('taskNumberFrom', () => {
  it('reads the key from the title first, then the branch', () => {
    expect(taskNumberFrom('TASK-24: Rotate refresh tokens', 'feature/x')).toBe(24);
    expect(taskNumberFrom('Rotate refresh tokens', 'task-31-map-clustering')).toBe(31);
    expect(taskNumberFrom('task_7 tidy up', 'main')).toBe(7);
    expect(taskNumberFrom('[TASK 12] Fix', 'x')).toBe(12);
  });
  it('returns null when nothing matches', () => {
    expect(taskNumberFrom('Fix the thing', 'fix-thing')).toBeNull();
    expect(taskNumberFrom('MULTITASK-3 rename', 'x')).toBeNull();
  });
});

describe('checksFrom', () => {
  it('maps GitHub statuses and conclusions', () => {
    expect(checksFrom('in_progress', null)).toBe('PENDING');
    expect(checksFrom('queued', null)).toBe('PENDING');
    expect(checksFrom('completed', 'success')).toBe('SUCCESS');
    expect(checksFrom('completed', 'failure')).toBe('FAILURE');
    expect(checksFrom('completed', 'timed_out')).toBe('FAILURE');
    expect(checksFrom('completed', 'cancelled')).toBe('FAILURE');
    expect(checksFrom('completed', 'skipped')).toBeNull();
    expect(checksFrom('completed', 'neutral')).toBeNull();
  });
});

describe('repoName', () => {
  it('produces a valid GitHub repo name', () => {
    expect(repoName('real-time-delivery-platform')).toBe('real-time-delivery-platform');
    expect(repoName('Café & Co!')).toBe('caf-co');
    expect(repoName('---')).toBe('project');
    expect(repoName('a'.repeat(200))).toHaveLength(90);
  });
});
