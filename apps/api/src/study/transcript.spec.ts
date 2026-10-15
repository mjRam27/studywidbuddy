import { cleanSegments, fmtTime, parseTranscript, toSeconds, transcriptText, windowAround } from './transcript';

describe('parseTranscript', () => {
  it('reads a timestamp-per-line transcript and joins wrapped text', () => {
    const raw = [
      '0:00',
      'welcome to this lesson',
      'about tokens',
      '0:07',
      'first we define one',
      '1:02:05',
      'the end',
    ].join('\n');
    expect(parseTranscript(raw)).toEqual([
      { start: 0, text: 'welcome to this lesson about tokens' },
      { start: 7, text: 'first we define one' },
      { start: 3725, text: 'the end' },
    ]);
  });

  it('reads inline "[mm:ss] text" and "mm:ss text" lines', () => {
    expect(parseTranscript('[00:12] hello there\n00:20 - next part')).toEqual([
      { start: 12, text: 'hello there' },
      { start: 20, text: 'next part' },
    ]);
  });

  it('returns nothing for text without timestamps', () => {
    expect(parseTranscript('just some notes\nwithout times')).toEqual([]);
  });
});

describe('transcript helpers', () => {
  const segs = [0, 60, 120, 180, 240, 300].map((s) => ({ start: s, text: `at ${s}` }));

  it('converts and formats times', () => {
    expect(toSeconds('1:02:03')).toBe(3723);
    expect(toSeconds('4:05')).toBe(245);
    expect(fmtTime(245)).toBe('4:05');
    expect(fmtTime(3723)).toBe('1:02:03');
  });

  it('picks the part around the current position', () => {
    expect(windowAround(segs, 200).map((s) => s.start)).toEqual([60, 120, 180, 240]);
  });

  it('formats prompt text within a length cap', () => {
    expect(transcriptText(segs.slice(0, 2))).toBe('[0:00] at 0\n[1:00] at 60');
    expect(transcriptText(segs, 20).split('\n')).toHaveLength(1);
  });

  it('cleans untrusted segment data', () => {
    expect(
      cleanSegments([{ start: 9.6, text: ' b ' }, { start: -3, text: 'a' }, { start: 'x', text: 'bad' }, null]),
    ).toEqual([
      { start: 0, text: 'a' },
      { start: 10, text: 'b' },
    ]);
    expect(cleanSegments('nope')).toEqual([]);
  });
});
