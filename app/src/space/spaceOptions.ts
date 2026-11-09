// What the page hands space (scene.ts): where it draws, what it is told back, and how it names a world.
export interface SpaceEvents {
  /** A world asked: a planet clicked, a wheel in over it, its label. */
  readonly world: (id: string) => void;
  /** A system asked, or zoomed into. */
  readonly system: (id: string) => void;
  /** The universe asked, or zoomed out to. */
  readonly universe: () => void;
  /** The flight to a page's planet nears its end, then lands. */
  readonly near: () => void;
  readonly landed: () => void;
  /** The first frame of the universe is drawn. */
  readonly drawn: () => void;
}

export interface SpaceOptions {
  readonly canvas: HTMLCanvasElement;
  readonly labels: HTMLElement;
  readonly base: string;
  readonly events: SpaceEvents;
  readonly still: () => boolean;
  /** The chat's small view: it draws while the chat is full, with no sky (no stars, dust or far suns) on a transparent canvas. */
  readonly inChat?: boolean;
  /** The name a world or a namespace shows. */
  readonly name: (id: string) => string;
  /** A world's one live fact, once known (the home's first screen names carry it). */
  readonly fact?: (id: string) => number | undefined;
}
