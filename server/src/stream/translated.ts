// The translations on the stream (stream.ts): a ring of their last events for each room and language, the frame to the streams that asked
// the language, and the languages signed-in streams read each world in (languages.ts).
import type { TranslationEvent } from "@gnoworld/schemas";
import { makeLanguages } from "./languages.ts";

type Language = TranslationEvent["language"];

export interface Watcher {
  rooms: ReadonlySet<string>;
  worlds: ReadonlySet<string>;
  account: string | undefined;
  language: Language | undefined;
}

export interface Framed {
  id: number;
  text: string;
}

const frame = (id: number, event: TranslationEvent): string =>
  `id: ${String(id)}\nevent: translation\ndata: ${JSON.stringify(event)}\n\n`;

/** Each key's last `pending` entries, oldest first; a key is kept only while 10,000 or fewer are. */
export class Rings<T> extends Map<string, T[]> {
  readonly #pending: number;

  constructor(pending: number) {
    super();
    this.#pending = pending;
  }

  push(key: string, entry: T): void {
    const kept = this.get(key) ?? [];
    kept.push(entry);
    if (kept.length > this.#pending) kept.shift();
    if (kept.length === 1 && this.size < 10_000) this.set(key, kept);
  }

  /** Drops the entries `gone` names from a key's ring. */
  purge(key: string, gone: (entry: T) => boolean): void {
    const kept = this.get(key)?.filter((entry) => !gone(entry));
    if (kept === undefined) return;
    if (kept.length === 0) this.delete(key);
    else this.set(key, kept);
  }
}

export function translationSide<C extends Watcher>(
  parts: {
    /** The next id of the stream's one sequence. */
    next: () => number;
    clients: ReadonlySet<C>;
    write: (client: C, text: string) => void;
    /** The events a ring keeps. */
    pending: number;
  },
  options: { now?: (() => number) | undefined; languageMs?: number | undefined },
) {
  const { next, clients, write, pending } = parts;
  const rings = new Rings<{ id: number; event: TranslationEvent }>(pending);
  const languages = makeLanguages<Language>(options.now ?? Date.now, options.languageMs ?? 15 * 60_000);
  const ringOf = (room: string, language: Language): string => `${room} ${language}`;
  const keep = (event: TranslationEvent): void => {
    const id = next();
    const ring = ringOf(event.room, event.language);
    // A gone line is told to the readers now and kept from the ring: a replay never holds words that were edited or hidden.
    if (event.status === "gone") rings.purge(ring, (entry) => entry.event.msgid === event.msgid);
    else rings.push(ring, { id, event });
    const text = frame(id, event);
    for (const client of clients)
      if (client.language === event.language && client.rooms.has(event.room)) write(client, text);
  };
  const open = (world: string): { account: string; language: Language }[] =>
    [...clients].flatMap(({ account, language, worlds }) =>
      account !== undefined && language !== undefined && worlds.has(world) ? [{ account, language }] : [],
    );
  return {
    /** What the stream hands out: a translation told, and the languages in use on a world. */
    api: {
      translation: keep,
      languages: (world: string, except?: string): readonly Language[] => languages.inUse(world, open(world), except),
    },
    /** The stream began or ended: a signed-in one's language is in use on its worlds from then. */
    touch: ({ account, language, worlds }: C): void => {
      if (account !== undefined && language !== undefined) languages.touch(worlds, language, account);
    },
    /** What a client missed after `after`: its rooms' events in its language. */
    missed: (client: C, after: number): Framed[] => {
      const { language } = client;
      if (language === undefined) return [];
      return [...client.rooms]
        .flatMap((room) => rings.get(ringOf(room, language)) ?? [])
        .filter(({ id }) => id > after)
        .map(({ id, event }) => ({ id, text: frame(id, event) }));
    },
    rings,
  };
}
