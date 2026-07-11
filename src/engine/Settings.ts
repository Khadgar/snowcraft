/**
 * Persistent settings & save data backed by localStorage (design §28).
 * Future-proofed as a versioned JSON blob; unknown/missing fields fall back to
 * defaults so older saves keep working.
 */

export type AiDifficulty = 'easy' | 'normal' | 'hard';

/** Which team(s) may collect arena pickup buffs (`off` disables them). */
export type BuffTarget = 'off' | 'player' | 'both';

export interface SaveData {
  muted: boolean;
  volume: number;
  difficulty: AiDifficulty;
  /** Selected map file name under `maps/` (e.g. "arena1.json"). */
  selectedMap: string;
  /** Number of enemy units to field (1–3). */
  enemyCount: number;
  /** Hits each enemy can take before being defeated (1–5). */
  enemyLives: number;
  /** Lives the player starts with (respawns while any remain) (1–5). */
  playerLives: number;
  /** Who can pick up arena buffs. */
  buffs: BuffTarget;
  wins: number;
  losses: number;
}

const STORAGE_KEY = 'snowcraft.save.v1';

/** Allowed range for the enemy-count menu option. */
export const ENEMY_COUNT_RANGE = { min: 1, max: 3 } as const;
/** Allowed range for the enemy-lives menu option. */
export const ENEMY_LIVES_RANGE = { min: 1, max: 5 } as const;
/** Allowed range for the player-lives menu option. */
export const PLAYER_LIVES_RANGE = { min: 1, max: 5 } as const;

const DEFAULTS: SaveData = {
  muted: false,
  volume: 0.8,
  difficulty: 'normal',
  selectedMap: 'arena1.json',
  enemyCount: 3,
  enemyLives: 3,
  playerLives: 3,
  buffs: 'player',
  wins: 0,
  losses: 0,
};

function isDifficulty(value: unknown): value is AiDifficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function isBuffTarget(value: unknown): value is BuffTarget {
  return value === 'off' || value === 'player' || value === 'both';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function coerce(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    muted: typeof obj.muted === 'boolean' ? obj.muted : DEFAULTS.muted,
    volume: typeof obj.volume === 'number' ? Math.min(1, Math.max(0, obj.volume)) : DEFAULTS.volume,
    difficulty: isDifficulty(obj.difficulty) ? obj.difficulty : DEFAULTS.difficulty,
    selectedMap: typeof obj.selectedMap === 'string' ? obj.selectedMap : DEFAULTS.selectedMap,
    enemyCount: clampInt(obj.enemyCount, ENEMY_COUNT_RANGE.min, ENEMY_COUNT_RANGE.max, DEFAULTS.enemyCount),
    enemyLives: clampInt(obj.enemyLives, ENEMY_LIVES_RANGE.min, ENEMY_LIVES_RANGE.max, DEFAULTS.enemyLives),
    playerLives: clampInt(obj.playerLives, PLAYER_LIVES_RANGE.min, PLAYER_LIVES_RANGE.max, DEFAULTS.playerLives),
    buffs: isBuffTarget(obj.buffs) ? obj.buffs : DEFAULTS.buffs,
    wins: typeof obj.wins === 'number' ? obj.wins : DEFAULTS.wins,
    losses: typeof obj.losses === 'number' ? obj.losses : DEFAULTS.losses,
  };
}

export class Settings {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  get all(): Readonly<SaveData> {
    return this.data;
  }

  get<K extends keyof SaveData>(key: K): SaveData[K] {
    return this.data[key];
  }

  set<K extends keyof SaveData>(key: K, value: SaveData[K]): void {
    this.data[key] = value;
    this.save();
  }

  recordResult(playerWon: boolean): void {
    if (playerWon) this.data.wins += 1;
    else this.data.losses += 1;
    this.save();
  }

  reset(): void {
    this.data = { ...DEFAULTS };
    this.save();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return coerce(JSON.parse(raw));
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage may be unavailable (private mode / quota); ignore.
    }
  }
}
