import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Settings } from './Settings';

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
});
