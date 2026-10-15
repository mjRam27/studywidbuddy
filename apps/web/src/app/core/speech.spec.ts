import { speechChunks } from './speech';

describe('speechChunks', () => {
  it('keeps short text as one chunk', () => {
    expect(speechChunks('Hello there. How are you?')).toEqual(['Hello there. How are you?']);
  });

  it('groups sentences up to the limit', () => {
    const s = 'One two three. Four five six. Seven eight nine.';
    expect(speechChunks(s, 30)).toEqual(['One two three. Four five six.', 'Seven eight nine.']);
  });

  it('hard-splits a sentence longer than the limit', () => {
    const chunks = speechChunks('a'.repeat(50), 20);
    expect(chunks.map((c) => c.length)).toEqual([20, 20, 10]);
  });

  it('normalises whitespace and drops empty input', () => {
    expect(speechChunks('  spaced\n\nout  ')).toEqual(['spaced out']);
    expect(speechChunks('   ')).toEqual([]);
  });
});
