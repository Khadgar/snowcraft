/**
 * Persistent settings & save data backed by localStorage (design §28).
 * Future-proofed as a versioned JSON blob; unknown/missing fields fall back to
 * defaults so older saves keep working.
 */

export type AiDifficulty = 'easy' | 'normal' | 'hard';

/** Which team(s) may collect arena pickup buffs (`off` disables them). */
export type BuffTarget = 'off' | 'player' | 'both';

/** A recorded high-score run (design: competitive scoring, local leaderboard). */
export interface ScoreEntry {
  /** Player-chosen display name. */
  name: string;
  score: number;
  difficulty: AiDifficulty;
  /** Seconds taken to clear the level. */
  timeSeconds: number;
  /** Lives spent (deaths / respawns used) before winning. */
  livesSpent: number;
  /** Map file name the run was played on. */
  map: string;
  /** Epoch milliseconds when the score was set. */
  date: number;
}

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
  /** Player display name recorded onto leaderboard entries. */
  playerName: string;
  /** Whether the in-game FPS/frame-time pill is shown. */
  showFps: boolean;
  wins: number;
  losses: number;
  /** Local high-score board, sorted by score descending. */
  leaderboard: ScoreEntry[];
}

const STORAGE_KEY = 'snowcraft.save.v1';

/** Allowed range for the enemy-count menu option. */
export const ENEMY_COUNT_RANGE = { min: 1, max: 3 } as const;
/** Allowed range for the enemy-lives menu option. */
export const ENEMY_LIVES_RANGE = { min: 1, max: 5 } as const;
/** Allowed range for the player-lives menu option. */
export const PLAYER_LIVES_RANGE = { min: 1, max: 5 } as const;
/** Maximum number of high-score entries kept on the local leaderboard. */
export const LEADERBOARD_MAX = 10;
/** Default player display name (on-theme, tidy for the leaderboard). */
export const DEFAULT_PLAYER_NAME = 'Frosty';
/** Maximum length of a player display name. */
export const PLAYER_NAME_MAX = 20;

const DEFAULTS: SaveData = {
  muted: false,
  volume: 0.8,
  difficulty: 'normal',
  selectedMap: 'arena1.json',
  enemyCount: 3,
  enemyLives: 3,
  playerLives: 3,
  buffs: 'player',
  playerName: DEFAULT_PLAYER_NAME,
  showFps: false,
  wins: 0,
  losses: 0,
  leaderboard: [],
};

/** Trims, length-caps, and falls back to the default for a player name. */
export function sanitizeName(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim().slice(0, PLAYER_NAME_MAX) : '';
  return trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_NAME;
}

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
    playerName: sanitizeName(obj.playerName),
    showFps: typeof obj.showFps === 'boolean' ? obj.showFps : DEFAULTS.showFps,
    wins: typeof obj.wins === 'number' ? obj.wins : DEFAULTS.wins,
    losses: typeof obj.losses === 'number' ? obj.losses : DEFAULTS.losses,
    leaderboard: coerceLeaderboard(obj.leaderboard),
  };
}

/** Validates and normalizes a stored leaderboard array, dropping bad entries. */
function coerceLeaderboard(raw: unknown): ScoreEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: ScoreEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.score !== 'number' || !Number.isFinite(e.score)) continue;
    entries.push({
      name: sanitizeName(e.name),
      score: Math.round(e.score),
      difficulty: isDifficulty(e.difficulty) ? e.difficulty : 'normal',
      timeSeconds: typeof e.timeSeconds === 'number' && Number.isFinite(e.timeSeconds) ? e.timeSeconds : 0,
      livesSpent:
        typeof e.livesSpent === 'number' && Number.isFinite(e.livesSpent) ? Math.max(0, Math.round(e.livesSpent)) : 0,
      map: typeof e.map === 'string' ? e.map : '',
      date: typeof e.date === 'number' && Number.isFinite(e.date) ? e.date : 0,
    });
  }
  return sortAndCapScores(entries);
}

/** Sorts scores highest-first and keeps only the top {@link LEADERBOARD_MAX}. */
function sortAndCapScores(entries: ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_MAX);
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

  /**
   * Records a high score, keeping the leaderboard sorted and capped. Returns the
   * new entry's 1-based rank, or -1 if it did not make the board.
   */
  addScore(entry: ScoreEntry): number {
    const capped = sortAndCapScores([...this.data.leaderboard, entry]);
    this.data.leaderboard = capped;
    this.save();
    const index = capped.indexOf(entry);
    return index === -1 ? -1 : index + 1;
  }

  clearLeaderboard(): void {
    this.data.leaderboard = [];
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
