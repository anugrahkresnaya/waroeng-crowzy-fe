import { Game } from './game';
import type { Content } from './schema';
import type { LoggedCommand } from './types';

/**
 * Rebuilds a run from its seed and command log, across as many days as it covers.
 * Used to verify scores on a server later, and in tests to prove the engine is deterministic.
 */
export function replay(content: Content, seed: number, log: readonly LoggedCommand[], day = 0): Game {
  const game = new Game(content, { seed, day });
  let next = 0;
  for (;;) {
    while (next < log.length && log[next].tick <= game.state.tick) game.dispatch(log[next++].command);
    if (game.state.phase === 'open') {
      game.tick();
    } else if (next < log.length) {
      // Time only moves while the shop is open, so a later command in a closed phase is next in line.
      game.dispatch(log[next++].command);
    } else {
      break;
    }
  }
  return game;
}
