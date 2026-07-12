import { render, type JSX } from 'preact';
import type { EventBus } from '../core/EventBus';
import type { ScoreEntry } from '../engine/Settings';
import { TEAM_COLORS } from '../game/config';
import { formatClock } from '../game/score';
import { Team } from '../game/types';
import styles from './Menus.module.css';

export interface MenuActions {
  start(): void;
  togglePause(): void;
  restart(): void;
  /** Optional map picker shown on the main menu. */
  maps?: ReadonlyArray<{ label: string; value: string }>;
  selectedMap?: string;
  onSelectMap?(value: string): void;
  /** Optional sound toggle shown on the main menu. */
  muted?: boolean;
  onToggleMute?(muted: boolean): void;
  /** Optional AI difficulty picker shown on the main menu. */
  difficulties?: ReadonlyArray<{ label: string; value: string }>;
  selectedDifficulty?: string;
  onSelectDifficulty?(value: string): void;
  /** Optional opponent-count picker shown on the main menu. */
  opponents?: ReadonlyArray<{ label: string; value: string }>;
  selectedOpponents?: string;
  onSelectOpponents?(value: string): void;
  /** Optional enemy-lives picker shown on the main menu. */
  lives?: ReadonlyArray<{ label: string; value: string }>;
  selectedLives?: string;
  onSelectLives?(value: string): void;
  /** Optional player-lives picker shown on the main menu. */
  playerLives?: ReadonlyArray<{ label: string; value: string }>;
  selectedPlayerLives?: string;
  onSelectPlayerLives?(value: string): void;
  /** Optional buff-pickup picker shown on the main menu. */
  buffOptions?: ReadonlyArray<{ label: string; value: string }>;
  selectedBuffs?: string;
  onSelectBuffs?(value: string): void;
  /** Optional player-name field shown on the main menu. */
  playerName?: string;
  onSetName?(name: string): void;
  playerNameMax?: number;
  /** Optional FPS-panel toggle shown on the main menu. */
  showFps?: boolean;
  onToggleFps?(show: boolean): void;
  /** Optional win/loss tally shown on the main menu. */
  scores?: { wins: number; losses: number };
  /** Optional local leaderboard entries (already sorted, highest first). */
  leaderboard?: ReadonlyArray<ScoreEntry>;
  onClearLeaderboard?(): void;
}

/** Outcome of a finished match, shown on the result screen. */
export interface RunResult {
  won: boolean;
  score: number;
  /** 1-based leaderboard rank, or -1 if the score didn't make the board. */
  rank: number;
  timeSeconds: number;
  livesSpent: number;
  difficulty: string;
}

type TabId = 'options' | 'howto' | 'leaderboard';
type ScreenId = 'main' | 'pause' | 'result' | 'none';

/** Internal callbacks the view triggers; owned by the {@link Menus} controller. */
interface MenusHandlers {
  onStart(): void;
  onTab(id: TabId): void;
  onToggleMute(): void;
  onSetName(name: string): void;
  onToggleFps(): void;
  onResume(): void;
  onRestart(): void;
  onPlayAgain(): void;
}

const TABS: ReadonlyArray<[TabId, string]> = [
  ['options', 'Options'],
  ['howto', 'How to Play'],
  ['leaderboard', 'Leaderboard'],
];

const HOWTO: ReadonlyArray<{ heading: string; lines: ReadonlyArray<string> }> = [
  {
    heading: 'Objective',
    lines: ['You control a single fighter. Wipe out the entire enemy squad to clear the level.'],
  },
  {
    heading: 'Controls',
    lines: [
      'Move: WASD, or right-click a destination.',
      'Aim & throw: hold the left mouse over the battlefield to charge (power grows), release to throw. Aiming cannot be cancelled once started.',
      'Pause: Esc or P.',
    ],
  },
  {
    heading: 'Lives & respawns',
    lines: [
      'When your fighter is eliminated it respawns at a random spot with 5s immunity — as long as you have lives left. Run out of lives and it is game over.',
    ],
  },
  {
    heading: 'Buffs',
    lines: [
      'Grab arena pickups: a heart (extra life), a shield (5s immunity) and a lightning bolt (speed boost).',
    ],
  },
  {
    heading: 'Scoring',
    lines: [
      'Clearing a level earns a score. Higher difficulty, faster clears and fewer lives spent all mean more points — see the Leaderboard tab.',
    ],
  },
];

const teamColor = (team: Team): string => `#${TEAM_COLORS[team].toString(16).padStart(6, '0')}`;

/** Uppercases the first character of a string (e.g. difficulty ids for display). */
function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function Button(props: { label: string; onClick: () => void; ghost?: boolean }): JSX.Element {
  const cls = props.ghost ? `${styles.button} ${styles.buttonGhost}` : styles.button;
  return (
    <button type="button" class={cls} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function SelectField(props: {
  caption: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  selected: string | undefined;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label class={styles.field}>
      <span>{props.caption}</span>
      <select class={styles.select} onChange={(e) => props.onChange(e.currentTarget.value)}>
        {props.options.map((o) => (
          <option value={o.value} selected={o.value === props.selected}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField(props: {
  caption: string;
  value: string;
  maxLength?: number;
  onInput: (value: string) => void;
}): JSX.Element {
  return (
    <label class={styles.field}>
      <span>{props.caption}</span>
      <input
        class={styles.input}
        type="text"
        value={props.value}
        maxLength={props.maxLength}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </label>
  );
}

function OptionsTab(props: {
  actions: MenuActions;
  muted: boolean;
  onToggleMute: () => void;
  playerName: string;
  onSetName: (name: string) => void;
  showFps: boolean;
  onToggleFps: () => void;
}): JSX.Element {
  const { actions } = props;
  return (
    <div class={styles.tabPanel}>
      <p class={styles.text}>Set up your match, then hit Start Battle.</p>
      <div class={styles.options}>
        {actions.onSetName ? (
          <TextField caption="Name" value={props.playerName} maxLength={actions.playerNameMax} onInput={props.onSetName} />
        ) : null}
        {actions.maps?.length ? (
          <SelectField caption="Map" options={actions.maps} selected={actions.selectedMap} onChange={(v) => actions.onSelectMap?.(v)} />
        ) : null}
        {actions.difficulties?.length ? (
          <SelectField caption="AI" options={actions.difficulties} selected={actions.selectedDifficulty} onChange={(v) => actions.onSelectDifficulty?.(v)} />
        ) : null}
        {actions.playerLives?.length ? (
          <SelectField caption="Your Lives" options={actions.playerLives} selected={actions.selectedPlayerLives} onChange={(v) => actions.onSelectPlayerLives?.(v)} />
        ) : null}
        {actions.opponents?.length ? (
          <SelectField caption="Opponents" options={actions.opponents} selected={actions.selectedOpponents} onChange={(v) => actions.onSelectOpponents?.(v)} />
        ) : null}
        {actions.lives?.length ? (
          <SelectField caption="Enemy Lives" options={actions.lives} selected={actions.selectedLives} onChange={(v) => actions.onSelectLives?.(v)} />
        ) : null}
        {actions.buffOptions?.length ? (
          <SelectField caption="Buffs" options={actions.buffOptions} selected={actions.selectedBuffs} onChange={(v) => actions.onSelectBuffs?.(v)} />
        ) : null}
        {actions.muted !== undefined ? (
          <Button ghost label={props.muted ? 'Sound: Off' : 'Sound: On'} onClick={props.onToggleMute} />
        ) : null}
        {actions.showFps !== undefined ? (
          <Button ghost label={props.showFps ? 'FPS: On' : 'FPS: Off'} onClick={props.onToggleFps} />
        ) : null}
      </div>
    </div>
  );
}

function HowToTab(): JSX.Element {
  return (
    <div class={`${styles.tabPanel} ${styles.howto}`}>
      {HOWTO.map((section) => (
        <div class={styles.howtoSection}>
          <h3 class={styles.howtoHeading}>{section.heading}</h3>
          <ul class={styles.howtoList}>
            {section.lines.map((line) => (
              <li>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LeaderboardTab({ actions }: { actions: MenuActions }): JSX.Element {
  const entries = actions.leaderboard ?? [];
  if (entries.length === 0) {
    return (
      <div class={styles.tabPanel}>
        <p class={styles.text}>No scores yet — clear a level to set your first high score!</p>
      </div>
    );
  }

  const mapLabel = (value: string): string => actions.maps?.find((m) => m.value === value)?.label ?? value;
  const header = ['#', 'Name', 'Score', 'Diff', 'Time', 'Lives', 'Map'];

  return (
    <div class={styles.tabPanel}>
      <div class={styles.lb}>
        <div class={`${styles.lbRow} ${styles.lbRowHead}`}>
          {header.map((h) => (
            <div class={styles.lbCell}>{h}</div>
          ))}
        </div>
        {entries.map((entry, index) => {
          const cells = [
            String(index + 1),
            entry.name,
            String(entry.score),
            capitalize(entry.difficulty),
            formatClock(entry.timeSeconds),
            String(entry.livesSpent),
            mapLabel(entry.map),
          ];
          return (
            <div class={styles.lbRow}>
              {cells.map((c) => (
                <div class={styles.lbCell}>{c}</div>
              ))}
            </div>
          );
        })}
      </div>
      {actions.onClearLeaderboard ? (
        <Button ghost label="Clear scores" onClick={() => actions.onClearLeaderboard?.()} />
      ) : null}
    </div>
  );
}

function MainScreen(props: {
  actions: MenuActions;
  activeTab: TabId;
  muted: boolean;
  showFps: boolean;
  playerName: string;
  handlers: MenusHandlers;
}): JSX.Element {
  const { actions, activeTab, handlers } = props;
  return (
    <div class={styles.screen}>
      <div class={styles.backdrop} />
      <div class={`${styles.panel} ${styles.panelMain}`}>
        <h1 class={`${styles.title} ${styles.titleMain}`}>SnowCraft</h1>
        <div class={styles.tabbar}>
          {TABS.map(([id, label]) => (
            <div
              role="button"
              tabIndex={0}
              class={id === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => handlers.onTab(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlers.onTab(id);
                }
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div class={styles.tabcontent}>
          {activeTab === 'options' ? (
            <OptionsTab
              actions={actions}
              muted={props.muted}
              onToggleMute={handlers.onToggleMute}
              playerName={props.playerName}
              onSetName={handlers.onSetName}
              showFps={props.showFps}
              onToggleFps={handlers.onToggleFps}
            />
          ) : null}
          {activeTab === 'howto' ? <HowToTab /> : null}
          {activeTab === 'leaderboard' ? <LeaderboardTab actions={actions} /> : null}
        </div>
        <div class={styles.footer}>
          <Button label="Start Battle" onClick={handlers.onStart} />
          {actions.scores ? (
            <p class={styles.scores}>{`Wins ${actions.scores.wins}  •  Losses ${actions.scores.losses}`}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PauseScreen({ handlers }: { handlers: MenusHandlers }): JSX.Element {
  return (
    <div class={styles.screen}>
      <div class={styles.backdrop} />
      <div class={styles.panel}>
        <h2 class={styles.title}>Paused</h2>
        <p class={styles.text}>Take a cocoa break, then jump back into the flurry.</p>
        <div class={styles.actions}>
          <Button label="Resume" onClick={handlers.onResume} />
          <Button label="Restart" onClick={handlers.onRestart} />
        </div>
      </div>
    </div>
  );
}

function ResultScreen({ result, handlers }: { result: RunResult; handlers: MenusHandlers }): JSX.Element {
  const won = result.won;
  const screenClass = `${styles.screen} ${won ? styles.victory : styles.defeat}`;
  return (
    <div class={screenClass}>
      <div class={styles.backdrop} />
      <div class={styles.panel}>
        <h2 class={styles.title} style={{ color: teamColor(won ? Team.Player : Team.Enemy) }}>
          {won ? 'Victory!' : 'Defeat'}
        </h2>
        <p class={styles.text}>
          {won
            ? 'You cleared the level. Warm mittens all around!'
            : 'The rival squad claimed this round. Dust off the snow and try again.'}
        </p>
        {won ? (
          <p class={styles.resultScore}>
            {`Score ${result.score}${result.rank > 0 ? `  •  #${result.rank} on the board` : ''}`}
          </p>
        ) : null}
        {won ? (
          <p class={styles.resultDetail}>
            {`Time ${formatClock(result.timeSeconds)}  •  Lives spent ${result.livesSpent}  •  ${capitalize(result.difficulty)}`}
          </p>
        ) : null}
        <Button label="Play Again" onClick={handlers.onPlayAgain} />
      </div>
    </div>
  );
}

function MenusView(props: {
  screen: ScreenId;
  activeTab: TabId;
  muted: boolean;
  showFps: boolean;
  playerName: string;
  result: RunResult | undefined;
  actions: MenuActions;
  handlers: MenusHandlers;
}): JSX.Element | null {
  if (props.screen === 'result' && props.result) {
    return <ResultScreen result={props.result} handlers={props.handlers} />;
  }
  if (props.screen === 'main') {
    return (
      <MainScreen
        actions={props.actions}
        activeTab={props.activeTab}
        muted={props.muted}
        showFps={props.showFps}
        playerName={props.playerName}
        handlers={props.handlers}
      />
    );
  }
  if (props.screen === 'pause') {
    return <PauseScreen handlers={props.handlers} />;
  }
  return null;
}

/**
 * Preact-rendered menu overlay for the main menu (tabbed: Options / How to Play /
 * Leaderboard), pause menu, and round result screen. This thin controller owns
 * the visibility/tab state and delegates all game mutations to injected actions;
 * it re-renders only on state changes (never per frame).
 */
export class Menus {
  private readonly host: HTMLDivElement;
  private readonly handlers: MenusHandlers;
  private readonly unsubscribers: Array<() => void>;

  private mainVisible = true;
  private pauseRequested = false;
  private resultVisible = false;
  private activeTab: TabId = 'options';
  private muted: boolean;
  private showFps: boolean;
  private playerName: string;
  private result?: RunResult;

  constructor(
    container: HTMLElement,
    events: EventBus,
    private readonly actions: MenuActions,
  ) {
    this.muted = actions.muted ?? false;
    this.showFps = actions.showFps ?? false;
    this.playerName = actions.playerName ?? '';

    this.host = document.createElement('div');
    this.host.className = styles.root;
    this.host.style.position = 'absolute';
    this.host.style.inset = '0';
    this.host.style.pointerEvents = 'none';
    this.host.style.setProperty('--player-color', teamColor(Team.Player));
    container.append(this.host);

    this.handlers = {
      onStart: () => {
        this.mainVisible = false;
        this.rerender();
        actions.start();
      },
      onTab: (id) => {
        this.activeTab = id;
        this.rerender();
      },
      onToggleMute: () => {
        this.muted = !this.muted;
        actions.onToggleMute?.(this.muted);
        this.rerender();
      },
      onSetName: (name) => {
        // Persist live but do NOT re-render per keystroke (keeps input focus /
        // cursor); the field value stays in sync on the next natural re-render.
        this.playerName = name;
        actions.onSetName?.(name);
      },
      onToggleFps: () => {
        this.showFps = !this.showFps;
        actions.onToggleFps?.(this.showFps);
        this.rerender();
      },
      onResume: () => actions.togglePause(),
      onRestart: () => {
        this.pauseRequested = false;
        this.rerender();
        actions.restart();
      },
      onPlayAgain: () => {
        this.resultVisible = false;
        this.pauseRequested = false;
        this.rerender();
        actions.restart();
      },
    };

    this.unsubscribers = [
      events.on('GamePaused', ({ paused }) => {
        this.pauseRequested = paused;
        this.rerender();
      }),
    ];

    this.rerender();
  }

  /** Shows the victory/defeat screen, including the earned score on a win. */
  showResult(result: RunResult): void {
    this.result = result;
    this.resultVisible = true;
    this.pauseRequested = false;
    this.rerender();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    render(null, this.host);
    this.host.remove();
  }

  /** Current screen, using the same precedence as the original overlay. */
  private get screen(): ScreenId {
    if (this.resultVisible) return 'result';
    if (this.mainVisible) return 'main';
    if (this.pauseRequested) return 'pause';
    return 'none';
  }

  private rerender(): void {
    render(
      <MenusView
        screen={this.screen}
        activeTab={this.activeTab}
        muted={this.muted}
        showFps={this.showFps}
        playerName={this.playerName}
        result={this.result}
        actions={this.actions}
        handlers={this.handlers}
      />,
      this.host,
    );
  }
}
