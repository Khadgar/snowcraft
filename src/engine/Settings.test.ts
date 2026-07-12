import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Settings, type ScoreEntry } from './Settings';

class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Settings', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage = new FakeStorage();
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: FakeStorage }).localStorage;
  });

  it('provides defaults on first run', () => {
    const s = new Settings();
    expect(s.get('difficulty')).toBe('normal');
    expect(s.get('selectedMap')).toBe('arena1.json');
    expect(s.get('muted')).toBe(false);
    expect(s.get('wins')).toBe(0);
    expect(s.get('enemyCount')).toBe(3);
    expect(s.get('enemyLives')).toBe(3);
    expect(s.get('playerLives')).toBe(3);
    expect(s.get('playerName')).toBe('Frosty');
    expect(s.get('showFps')).toBe(false);
  });

  it('persists and clamps enemy count and lives to their ranges', () => {
    const a = new Settings();
    a.set('enemyCount', 1);
    a.set('enemyLives', 5);
    const b = new Settings();
    expect(b.get('enemyCount')).toBe(1);
    expect(b.get('enemyLives')).toBe(5);

    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ enemyCount: 9, enemyLives: 0, playerLives: 9 }),
    );
    const c = new Settings();
    expect(c.get('enemyCount')).toBe(3); // clamped to max 3
    expect(c.get('enemyLives')).toBe(1); // clamped to min 1
    expect(c.get('playerLives')).toBe(5); // clamped to max 5
  });

  it('defaults buffs to the player squad and rejects invalid values', () => {
    const s = new Settings();
    expect(s.get('buffs')).toBe('player');

    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ buffs: 'nonsense' }),
    );
    expect(new Settings().get('buffs')).toBe('player');

    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ buffs: 'both' }),
    );
    expect(new Settings().get('buffs')).toBe('both');
  });

  it('persists values across instances', () => {
    const a = new Settings();
    a.set('muted', true);
    a.set('selectedMap', 'arena2.json');
    a.set('difficulty', 'hard');
    const b = new Settings();
    expect(b.get('muted')).toBe(true);
    expect(b.get('selectedMap')).toBe('arena2.json');
    expect(b.get('difficulty')).toBe('hard');
  });

  it('records wins and losses', () => {
    const s = new Settings();
    s.recordResult(true);
    s.recordResult(false);
    s.recordResult(true);
    expect(s.get('wins')).toBe(2);
    expect(s.get('losses')).toBe(1);
  });

  it('falls back to defaults on corrupt data', () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      '{ not valid json',
    );
    const s = new Settings();
    expect(s.get('difficulty')).toBe('normal');
  });

  it('coerces an out-of-range volume and bad difficulty', () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ volume: 5, difficulty: 'nightmare' }),
    );
    const s = new Settings();
    expect(s.get('volume')).toBe(1);
    expect(s.get('difficulty')).toBe('normal');
  });

  it('sanitizes the player name (trim, cap, blank falls back to default)', () => {
    const a = new Settings();
    a.set('playerName', '  Blizzard Bob  ');
    expect(new Settings().get('playerName')).toBe('Blizzard Bob');

    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ playerName: '   ' }),
    );
    expect(new Settings().get('playerName')).toBe('Frosty');

    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ playerName: 'x'.repeat(50) }),
    );
    expect(new Settings().get('playerName').length).toBe(20);
  });

  it('records high scores sorted, capped, and returns rank', () => {
    const s = new Settings();
    expect(s.get('leaderboard')).toEqual([]);
    const mk = (score: number): ScoreEntry => ({
      name: 'Frosty',
      score,
      difficulty: 'normal',
      timeSeconds: 10,
      livesSpent: 0,
      map: 'arena1.json',
      date: 1,
    });
    expect(s.addScore(mk(500))).toBe(1);
    expect(s.addScore(mk(1500))).toBe(1);
    expect(s.addScore(mk(1000))).toBe(2);
    expect(s.get('leaderboard').map((e) => e.score)).toEqual([1500, 1000, 500]);
    // Persisted across instances.
    expect(new Settings().get('leaderboard').map((e) => e.score)).toEqual([1500, 1000, 500]);
  });

  it('caps the leaderboard at 10 and reports off-board scores as -1', () => {
    const s = new Settings();
    for (let i = 1; i <= 10; i++) {
      s.addScore({ name: 'Frosty', score: i * 100, difficulty: 'normal', timeSeconds: 10, livesSpent: 0, map: 'm', date: i });
    }
    expect(s.get('leaderboard').length).toBe(10);
    expect(
      s.addScore({ name: 'Frosty', score: 5, difficulty: 'normal', timeSeconds: 10, livesSpent: 0, map: 'm', date: 11 }),
    ).toBe(-1);
    expect(s.get('leaderboard').length).toBe(10);
  });

  it('clears the leaderboard and drops malformed stored entries', () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({
        leaderboard: [
          { name: 'Yeti', score: 300, difficulty: 'hard', timeSeconds: 5, livesSpent: 1, map: 'm', date: 2 },
          { nope: true },
          42,
          { score: 'x' },
        ],
      }),
    );
    const s = new Settings();
    expect(s.get('leaderboard').length).toBe(1);
    expect(s.get('leaderboard')[0].score).toBe(300);
    expect(s.get('leaderboard')[0].name).toBe('Yeti');
    // A stored entry missing a name falls back to the default.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      'snowcraft.save.v1',
      JSON.stringify({ leaderboard: [{ score: 111, difficulty: 'easy', timeSeconds: 3, livesSpent: 0, map: 'm', date: 1 }] }),
    );
    expect(new Settings().get('leaderboard')[0].name).toBe('Frosty');
    s.clearLeaderboard();
    expect(s.get('leaderboard')).toEqual([]);
  });
});
