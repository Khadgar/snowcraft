import { describe, expect, it } from 'vitest';
import { computeScore, formatClock } from './score';

describe('computeScore', () => {
  it('rewards harder difficulty', () => {
    const base = { opponents: 3, timeSeconds: 20, livesSpent: 0 };
    const easy = computeScore({ ...base, difficulty: 'easy' });
    const normal = computeScore({ ...base, difficulty: 'normal' });
    const hard = computeScore({ ...base, difficulty: 'hard' });
    expect(hard).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(easy);
  });

  it('rewards faster clears', () => {
    const fast = computeScore({ difficulty: 'normal', opponents: 3, timeSeconds: 10, livesSpent: 0 });
    const slow = computeScore({ difficulty: 'normal', opponents: 3, timeSeconds: 90, livesSpent: 0 });
    expect(fast).toBeGreaterThan(slow);
  });

  it('penalizes lives spent', () => {
    const noDeaths = computeScore({ difficulty: 'normal', opponents: 3, timeSeconds: 20, livesSpent: 0 });
    const twoDeaths = computeScore({ difficulty: 'normal', opponents: 3, timeSeconds: 20, livesSpent: 2 });
    expect(noDeaths).toBeGreaterThan(twoDeaths);
  });

  it('never returns below the minimum', () => {
    const s = computeScore({ difficulty: 'easy', opponents: 0, timeSeconds: 100000, livesSpent: 100 });
    expect(s).toBeGreaterThanOrEqual(100);
  });

  it('falls back to a 1x multiplier for an unknown difficulty', () => {
    const s = computeScore({ difficulty: 'nonsense', opponents: 1, timeSeconds: 10, livesSpent: 0 });
    expect(s).toBeGreaterThan(0);
  });
});

describe('formatClock', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(600)).toBe('10:00');
  });
});
