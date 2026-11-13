// How a crowd of worlds is drawn (ADR-0002 §3): a lattice of this many slots or fewer draws every world as a planet; a bigger one only its
// `CLEAR_BODIES` most used, and every other world is grain in its belt.

export const CROWD_SLOTS = 32;
export const CLEAR_BODIES = 3;
