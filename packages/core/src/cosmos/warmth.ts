// A star's draws by its namespace, apart from its system (system.ts) so a world's recipe reads its star's warmth without the cosmos's
// layout: the generated worlds' chunk takes this alone.
import { cellHash, nextState, textHash, unitOf } from "../space/cell.ts";

/** gno.land's star, at the centre: a slug holds no dot, so no namespace is it. */
export const GNO_LAND = "gno.land";
const GREAT_WARMTH = 0.45;
const SALT = 2;

/** A namespace's star's draws, one a step. */
export function starDraws(id: string): (step: number) => number {
  const seed = textHash(`star ${id}`);
  return (step) => unitOf(nextState(cellHash(SALT, { x: seed, y: step, z: 0 })));
}

/** A namespace's star from red to white, 0 to 1: its system's light, and the plants of its worlds (recipe.ts). */
export const starWarmth = (namespace: string): number =>
  namespace === GNO_LAND ? GREAT_WARMTH : starDraws(namespace)(0);
