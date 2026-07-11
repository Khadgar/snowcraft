import type { EventBus } from '../core/EventBus';
import { TEAM_COLORS } from '../game/config';
import { Team } from '../game/types';

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
  /** Optional buff-pickup picker shown on the main menu. */
  buffOptions?: ReadonlyArray<{ label: string; value: string }>;
  selectedBuffs?: string;
  onSelectBuffs?(value: string): void;
  /** Optional win/loss tally shown on the main menu. */
  scores?: { wins: number; losses: number };
}

type MenuPanel = {
  root: HTMLDivElement;
  title: HTMLHeadingElement;
};

/**
 * DOM/CSS menu overlay for the main menu, pause menu, and round result screens.
 * It observes game events and delegates all game mutations to injected actions.
 */
export class Menus {
  private readonly root: HTMLDivElement;
  private readonly mainMenu: HTMLDivElement;
  private readonly pauseMenu: HTMLDivElement;
  private readonly resultMenu: MenuPanel;
  private readonly resultMessage: HTMLParagraphElement;
  private readonly unsubscribers: Array<() => void>;
  private mainVisible = true;
  private pauseRequested = false;
  private resultVisible = false;

  constructor(container: HTMLElement, events: EventBus, actions: MenuActions) {
    this.root = this.createDiv('snowcraft-menus');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';

    const style = document.createElement('style');
    style.textContent = this.styles();
    this.root.append(style);

    this.mainMenu = this.createShell('main');
    const mainPanel = this.createPanel();
    const mainTitle = document.createElement('h1');
    mainTitle.className = 'snowcraft-menus__title snowcraft-menus__title--main';
    mainTitle.textContent = 'SnowCraft';
    const tagline = this.createParagraph('Command your squad in a cozy, chaotic snowball showdown.');
    const controls = this.createParagraph('Select units, move as a team, charge throws, and outplay the rival squad.');
    controls.className = 'snowcraft-menus__help';
    const startButton = this.createButton('Start Battle');
    startButton.addEventListener('click', () => {
      this.mainVisible = false;
      this.render();
      actions.start();
    });
    const options = this.createMainOptions(actions);
    const scores = this.createScoresLine(actions);
    mainPanel.append(mainTitle, tagline, controls);
    if (options) mainPanel.append(options);
    mainPanel.append(startButton);
    if (scores) mainPanel.append(scores);
    this.mainMenu.append(this.createBackdrop(), mainPanel);

    this.pauseMenu = this.createShell('pause');
    const pausePanel = this.createPanel();
    const pauseTitle = document.createElement('h2');
    pauseTitle.className = 'snowcraft-menus__title';
    pauseTitle.textContent = 'Paused';
    const pauseText = this.createParagraph('Take a cocoa break, then jump back into the flurry.');
    const pauseActions = this.createDiv('snowcraft-menus__actions');
    const resumeButton = this.createButton('Resume');
    resumeButton.addEventListener('click', () => actions.togglePause());
    const restartButton = this.createButton('Restart');
    restartButton.addEventListener('click', () => {
      this.pauseRequested = false;
      this.render();
      actions.restart();
    });
    pauseActions.append(resumeButton, restartButton);
    pausePanel.append(pauseTitle, pauseText, pauseActions);
    this.pauseMenu.append(this.createBackdrop(), pausePanel);

    const resultRoot = this.createShell('result');
    const resultPanel = this.createPanel();
    const resultTitle = document.createElement('h2');
    resultTitle.className = 'snowcraft-menus__title';
    this.resultMessage = this.createParagraph('');
    const playAgainButton = this.createButton('Play Again');
    playAgainButton.addEventListener('click', () => {
      this.resultVisible = false;
      this.pauseRequested = false;
      this.render();
      actions.restart();
    });
    resultPanel.append(resultTitle, this.resultMessage, playAgainButton);
    resultRoot.append(this.createBackdrop(), resultPanel);
    this.resultMenu = { root: resultRoot, title: resultTitle };

    this.root.append(this.mainMenu, this.pauseMenu, this.resultMenu.root);
    container.append(this.root);

    this.unsubscribers = [
      events.on('GamePaused', ({ paused }) => {
        this.pauseRequested = paused;
        this.render();
      }),
      events.on('RoundEnded', ({ winner }) => {
        this.showResult(winner);
      }),
    ];

    this.render();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.root.remove();
  }

  private showResult(winner: Team): void {
    const playerWon = winner === Team.Player;
    this.resultVisible = true;
    this.pauseRequested = false;
    this.resultMenu.title.textContent = playerWon ? 'Victory!' : 'Defeat';
    this.resultMenu.title.style.color = this.teamColor(playerWon ? Team.Player : Team.Enemy);
    this.resultMessage.textContent = playerWon
      ? 'Your squad ruled the snowfield. Warm mittens all around!'
      : 'The rival squad claimed this round. Dust off the snow and try again.';
    this.resultMenu.root.classList.toggle('snowcraft-menus__screen--victory', playerWon);
    this.resultMenu.root.classList.toggle('snowcraft-menus__screen--defeat', !playerWon);
    this.render();
  }

  private render(): void {
    this.hideAll();

    if (this.resultVisible) {
      this.resultMenu.root.hidden = false;
      return;
    }

    if (this.mainVisible) {
      this.mainMenu.hidden = false;
      return;
    }

    if (this.pauseRequested) {
      this.pauseMenu.hidden = false;
    }
  }

  private hideAll(): void {
    this.mainMenu.hidden = true;
    this.pauseMenu.hidden = true;
    this.resultMenu.root.hidden = true;
  }

  private createShell(name: string): HTMLDivElement {
    const shell = this.createDiv(`snowcraft-menus__screen snowcraft-menus__screen--${name}`);
    shell.hidden = true;
    return shell;
  }

  private createPanel(): HTMLDivElement {
    return this.createDiv('snowcraft-menus__panel');
  }

  private createBackdrop(): HTMLDivElement {
    return this.createDiv('snowcraft-menus__backdrop');
  }

  private createButton(label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'snowcraft-menus__button';
    button.type = 'button';
    button.textContent = label;
    return button;
  }

  /** Builds the optional map-picker + sound-toggle row for the main menu. */
  private createMainOptions(actions: MenuActions): HTMLDivElement | null {
    const hasMaps = actions.maps !== undefined && actions.maps.length > 0;
    const hasDifficulty = actions.difficulties !== undefined && actions.difficulties.length > 0;
    const hasOpponents = actions.opponents !== undefined && actions.opponents.length > 0;
    const hasLives = actions.lives !== undefined && actions.lives.length > 0;
    const hasBuffs = actions.buffOptions !== undefined && actions.buffOptions.length > 0;
    const hasMute = actions.muted !== undefined;
    if (!hasMaps && !hasDifficulty && !hasOpponents && !hasLives && !hasBuffs && !hasMute) return null;

    const row = this.createDiv('snowcraft-menus__options');
    if (hasMaps && actions.maps) {
      this.appendSelectField(row, 'Map', actions.maps, actions.selectedMap, (value) =>
        actions.onSelectMap?.(value),
      );
    }
    if (hasDifficulty && actions.difficulties) {
      this.appendSelectField(row, 'AI', actions.difficulties, actions.selectedDifficulty, (value) =>
        actions.onSelectDifficulty?.(value),
      );
    }
    if (hasOpponents && actions.opponents) {
      this.appendSelectField(row, 'Opponents', actions.opponents, actions.selectedOpponents, (value) =>
        actions.onSelectOpponents?.(value),
      );
    }
    if (hasLives && actions.lives) {
      this.appendSelectField(row, 'Lives', actions.lives, actions.selectedLives, (value) =>
        actions.onSelectLives?.(value),
      );
    }
    if (hasBuffs && actions.buffOptions) {
      this.appendSelectField(row, 'Buffs', actions.buffOptions, actions.selectedBuffs, (value) =>
        actions.onSelectBuffs?.(value),
      );
    }
    if (hasMute) {
      let muted = actions.muted ?? false;
      const toggle = this.createButton(muted ? 'Sound: Off' : 'Sound: On');
      toggle.classList.add('snowcraft-menus__button--ghost');
      toggle.addEventListener('click', () => {
        muted = !muted;
        toggle.textContent = muted ? 'Sound: Off' : 'Sound: On';
        actions.onToggleMute?.(muted);
      });
      row.append(toggle);
    }
    return row;
  }

  private appendSelectField(
    row: HTMLDivElement,
    caption: string,
    options: ReadonlyArray<{ label: string; value: string }>,
    selected: string | undefined,
    onChange: (value: string) => void,
  ): void {
    const label = document.createElement('label');
    label.className = 'snowcraft-menus__field';
    const cap = document.createElement('span');
    cap.textContent = caption;
    const select = document.createElement('select');
    select.className = 'snowcraft-menus__select';
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      if (option.value === selected) element.selected = true;
      select.append(element);
    }
    select.addEventListener('change', () => onChange(select.value));
    label.append(cap, select);
    row.append(label);
  }

  private createScoresLine(actions: MenuActions): HTMLParagraphElement | null {
    if (!actions.scores) return null;
    const line = this.createParagraph(
      `Wins ${actions.scores.wins}  •  Losses ${actions.scores.losses}`,
    );
    line.className = 'snowcraft-menus__scores';
    return line;
  }

  private createParagraph(text: string): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.className = 'snowcraft-menus__text';
    paragraph.textContent = text;
    return paragraph;
  }

  private createDiv(className: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = className;
    return div;
  }

  private teamColor(team: Team): string {
    return `#${TEAM_COLORS[team].toString(16).padStart(6, '0')}`;
  }

  private styles(): string {
    return `
.snowcraft-menus {
  color: #25364a;
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: hidden;
}

.snowcraft-menus__screen {
  align-items: center;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
  position: absolute;
}

.snowcraft-menus__screen[hidden] {
  display: none;
}

.snowcraft-menus__backdrop {
  background:
    radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.42), transparent 28%),
    linear-gradient(135deg, rgba(18, 44, 77, 0.38), rgba(64, 101, 137, 0.5));
  inset: 0;
  pointer-events: auto;
  position: absolute;
}

.snowcraft-menus__screen--victory .snowcraft-menus__backdrop {
  background: linear-gradient(135deg, rgba(24, 101, 170, 0.36), rgba(185, 226, 255, 0.48));
}

.snowcraft-menus__screen--defeat .snowcraft-menus__backdrop {
  background: linear-gradient(135deg, rgba(122, 28, 35, 0.4), rgba(72, 42, 62, 0.52));
}

.snowcraft-menus__panel {
  backdrop-filter: blur(12px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(232, 246, 255, 0.9));
  border: 3px solid rgba(255, 255, 255, 0.96);
  border-radius: 30px;
  box-shadow: 0 24px 60px rgba(20, 44, 70, 0.32), inset 0 -8px 0 rgba(117, 176, 219, 0.12);
  max-width: min(560px, 100%);
  padding: clamp(28px, 5vw, 46px);
  pointer-events: auto;
  position: relative;
  text-align: center;
}

.snowcraft-menus__title {
  color: #2f5f91;
  font-size: clamp(38px, 8vw, 78px);
  font-weight: 1000;
  letter-spacing: 0.02em;
  line-height: 0.95;
  margin: 0 0 18px;
  text-shadow: 0 3px 0 #ffffff, 0 10px 22px rgba(55, 103, 143, 0.18);
}

.snowcraft-menus__title--main {
  color: ${this.teamColor(Team.Player)};
  font-size: clamp(48px, 10vw, 92px);
}

.snowcraft-menus__text {
  color: #455f79;
  font-size: clamp(17px, 2.5vw, 22px);
  font-weight: 750;
  line-height: 1.35;
  margin: 0 auto 18px;
  max-width: 440px;
}

.snowcraft-menus__help {
  color: #607892;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 26px;
}

.snowcraft-menus__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
}

.snowcraft-menus__button {
  background: linear-gradient(180deg, #ffffff, #dff3ff);
  border: 0;
  border-radius: 999px;
  box-shadow: 0 8px 0 #75b5df, 0 14px 26px rgba(33, 80, 119, 0.22);
  color: #244766;
  cursor: pointer;
  font: inherit;
  font-size: 19px;
  font-weight: 950;
  min-width: 150px;
  padding: 15px 24px 17px;
  transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
}

.snowcraft-menus__button:hover {
  filter: brightness(1.04);
  transform: translateY(-2px);
  box-shadow: 0 10px 0 #75b5df, 0 18px 30px rgba(33, 80, 119, 0.25);
}

.snowcraft-menus__button:active {
  transform: translateY(5px);
  box-shadow: 0 3px 0 #75b5df, 0 8px 18px rgba(33, 80, 119, 0.2);
}

.snowcraft-menus__button:focus-visible {
  outline: 4px solid rgba(58, 160, 255, 0.42);
  outline-offset: 4px;
}

.snowcraft-menus__options {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  margin-bottom: 22px;
}

.snowcraft-menus__field {
  align-items: center;
  color: #3a597a;
  display: flex;
  font-size: 15px;
  font-weight: 850;
  gap: 8px;
}

.snowcraft-menus__select {
  background: #ffffff;
  border: 2px solid #bcd9ef;
  border-radius: 12px;
  color: #244766;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  padding: 8px 12px;
}

.snowcraft-menus__button--ghost {
  box-shadow: 0 5px 0 #a9cbe4, 0 8px 16px rgba(33, 80, 119, 0.16);
  font-size: 16px;
  min-width: 120px;
  padding: 10px 18px 12px;
}

.snowcraft-menus__scores {
  border-top: 2px solid rgba(122, 152, 183, 0.2);
  color: #607892;
  font-size: 15px;
  font-weight: 800;
  margin: 26px 0 0;
  padding-top: 16px;
}

@media (max-width: 520px) {
  .snowcraft-menus__panel {
    border-radius: 22px;
    padding: 22px 18px 26px;
  }

  .snowcraft-menus__options {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .snowcraft-menus__field {
    justify-content: space-between;
  }

  .snowcraft-menus__select {
    flex: 1 1 auto;
    min-width: 0;
  }

  .snowcraft-menus__actions {
    flex-direction: column;
  }

  .snowcraft-menus__button,
  .snowcraft-menus__button--ghost {
    min-width: 0;
    width: 100%;
  }
}
`;
  }
}
