import { Game } from './game';
import type { Content } from './schema';
import type { LoggedCommand } from './types';

/**
 * Rebuilds a run from its seed and command log. Used to verify scores on a server later,
 * and in tests to prove the engine is deterministic.
 */
export function replay(content: Content, seed: number, log: readonly LoggedCommand[], day = 0): Game {
  const game = new Game(content, { seed, day });
  let next = 0;
  const applyDue = () => {
    while (next < log.length && log[next].tick <= game.state.tick) game.dispatch(log[next++].command);
  };
  for (;;) {
    applyDue();
    if (game.state.phase !== 'open') break;
    game.tick();
  }
  applyDue();
  return game;
}
