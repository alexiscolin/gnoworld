// What a world's view is told, and from where (ADR-0002 §3): the people present in its rooms and the times of their lines, from the page's
// store; the worlds' file, read once; whether this reader came before, told once a visit, so a first visit's appearance plays to its end.
// The view keeps the visit as the appearance starts (F4533); the page reads and keeps it: the scene holds no storage.
import { statusOrbit } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import type { StoreApi } from "zustand/vanilla";
import type { AppState } from "../../store/index.ts";
import { readingOf, type WorldReading } from "./reading.ts";

const PACE_MS = 1000;

/** What a world's page hands its scene. */
export interface WorldPage {
  readonly store: StoreApi<AppState>;
  /** Goes to an address of the page, by its router. */
  readonly open: (href: string) => void;
  /** The universe the page belongs to: a file of another is no file. */
  readonly universe: string;
  /** The world's slug: its rooms are `#<slug>` and `#<slug>/<name>`. */
  readonly slug: string;
  /** Where the world's page lives: its moons' links go there. */
  readonly path: string;
  /** The room the page asks for, `?room=`. */
  readonly room: string | null;
  /** What its realm reports, for the status ring. */
  readonly ring?: { readonly lit: number; readonly mark: number } | undefined;
}

export interface FeedOptions {
  readonly universe: string;
  readonly id: string;
  readonly page: WorldPage;
  /** The worlds' file, or none if it did not come. */
  readonly file: () => Promise<Worlds | undefined>;
  /** This reader came before. */
  readonly visited: boolean;
  readonly now?: () => number;
}

interface Told {
  read(reading: WorldReading): void;
  ring(orbit: ReturnType<typeof statusOrbit> | undefined): void;
}

export class WorldFeed {
  readonly #view: Told;
  readonly #options: FeedOptions;
  readonly #stop: () => void;
  #file: Worlds | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #gone = false;

  constructor(view: Told, options: FeedOptions) {
    this.#view = view;
    this.#options = options;
    this.#stop = options.page.store.subscribe(this.#changed);
    options.file().then(
      (file) => {
        this.#file = file;
        if (!this.#gone) this.refresh();
      },
      () => undefined,
    );
    this.refresh();
  }

  readonly #changed = (): void => {
    this.#timer ??= setTimeout(() => {
      this.#timer = undefined;
      this.refresh();
    }, PACE_MS);
  };

  /** Reads the world now. */
  refresh(): void {
    const { universe, id, page, visited, now = Date.now } = this.#options;
    const prefix = `#${page.slug}`;
    const people = new Set<string>();
    const lines: number[] = [];
    for (const [room, held] of Object.entries(page.store.getState().chat.rooms)) {
      if (room !== prefix && !room.startsWith(`${prefix}/`)) continue;
      for (const member of held.members) people.add(member);
      for (const line of held.lines) lines.push(Date.parse(line.time));
    }
    const reading = readingOf(this.#file, {
      universe,
      id,
      people: people.size,
      lines,
      visited,
      now: now(),
    });
    this.#view.read(reading);
  }

  /** What the realm reports now, for the status ring. */
  ring(ring: WorldPage["ring"]): void {
    this.#view.ring(ring === undefined ? undefined : statusOrbit(ring));
  }

  dispose(): void {
    this.#gone = true;
    this.#stop();
    clearTimeout(this.#timer);
  }
}
