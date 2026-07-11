import type { System } from '../ecs/System';
import { Team } from '../game/types';
import type { World } from '../game/World';

/**
 * Single-hero control aid: keeps the player's (sole) living unit selected every
 * step so the user never needs to click or TAB to select, and never loses the
 * selection (e.g. after clicking open ground or respawning). Any other
 * player-team units are deselected.
 */
export class AutoSelectSystem implements System {
  readonly name = 'autoselect';

  constructor(private readonly world: World) {}

  update(): void {
    let selectedOne = false;

    for (const player of this.world.players) {
      if (player.team !== Team.Player) continue;

      if (!selectedOne && player.alive) {
        player.selected = true;
        selectedOne = true;
      } else {
        player.selected = false;
      }
    }
  }
}
