import { SCORE } from './config';

export interface ScoreParams {
  /** AI difficulty id ('easy' | 'normal' | 'hard'). */
  difficulty: string;
  /** Number of enemy units in the match. */
  opponents: number;
  /** Seconds taken to clear the level. */
  timeSeconds: number;
  /** Lives spent (deaths / respawns used) before winning. */
  livesSpent: number;
}

/**
 * Computes the run score for clearing a level. Rewards higher difficulty, faster
 * clears and fewer lives spent (design: competitive scoring). Pure and
 * deterministic so it can be unit-tested and reused by UI.
 */
export function computeScore(params: ScoreParams): number {
  const mult = SCORE.difficultyMultiplier[params.difficulty] ?? 1;
  const timeBonus = Math.max(
    0,
    SCORE.timeBonusMax - SCORE.timeBonusDecayPerSecond * Math.max(0, params.timeSeconds),
  );
  const raw =
    SCORE.base +
    SCORE.perOpponent * Math.max(0, params.opponents) +
    timeBonus -
    SCORE.lifePenalty * Math.max(0, params.livesSpent);
  return Math.max(SCORE.min, Math.round(raw * mult));
}

/** Formats a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
