import { studyCredit } from './study-time';

describe('studyCredit', () => {
  const t0 = new Date('2026-11-10T10:00:00Z');
  const after = (sec: number) => new Date(t0.getTime() + sec * 1000);

  it('credits a minute for the first beat of the day', () => {
    expect(studyCredit(null, t0)).toBe(60);
  });

  it('credits the time since the last beat, at most a minute', () => {
    expect(studyCredit(t0, after(45))).toBe(45);
    expect(studyCredit(t0, after(60))).toBe(60);
    expect(studyCredit(t0, after(600))).toBe(60);
  });

  it('ignores beats that come too close together (a second tab)', () => {
    expect(studyCredit(t0, after(5))).toBe(0);
  });
});
