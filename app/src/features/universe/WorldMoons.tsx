// A world's rooms as moons (ADR-0002 §1, "Rooms as moons"): four at most, the room you are in always one, steady, each a link to its room
// placed under its moon by the scene, which hides it where the moon goes behind the world or over the plate. Only the rooms the world lists
// are moons: a realm of the world has no room, so no moon. A name is text; an address is built by the URL's own encoding.
import { moonSize, nextMoons, type Moons, type RoomCount } from "@gnoworld/core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MoonMark, WorldPage } from "../../scene/world/part.ts";
import { roomIds, shownRoom } from "../chat/index.ts";
import styles from "./WorldMoons.module.css";

// A room taking a moon's place waits minutes, so the set is asked again now and then though nothing was said.
const AGAIN_MS = 10_000;

interface Sky {
  moons(marks: readonly MoonMark[]): void;
}

function countsOf({ store, slug }: WorldPage): RoomCount[] {
  const { listed, rooms } = store.getState().chat;
  const ours = (room: string) => room === `#${slug}` || room.startsWith(`#${slug}/`);
  return (listed === undefined ? [] : roomIds(listed))
    .filter(ours)
    .map((room) => ({ room, people: rooms[room]?.members.length ?? 0 }));
}

function currentOf({ store, slug, room }: WorldPage): string | undefined {
  const { listed } = store.getState().chat;
  return listed === undefined ? undefined : shownRoom(slug, listed, room);
}

const nameOf = ({ slug }: WorldPage, room: string) => (room === `#${slug}` ? slug : room.slice(`#${slug}/`.length));

function hrefOf(page: WorldPage, room: string): string {
  return room === `#${page.slug}`
    ? page.path
    : `${page.path}?${new URLSearchParams({ room: nameOf(page, room) }).toString()}`;
}

// A page's moons, kept outside React: asked again on each change of the store and now and then, for their rules need the time to pass.
class MoonKeeper {
  #page: WorldPage;
  #moons: Moons;
  #told: () => void = () => undefined;

  constructor(page: WorldPage) {
    this.#page = page;
    this.#moons = nextMoons(undefined, countsOf(page), { current: currentOf(page), now: Date.now() });
  }

  readonly #update = () => {
    this.#moons = nextMoons(this.#moons, countsOf(this.#page), { current: currentOf(this.#page), now: Date.now() });
    this.#told();
  };

  /** The page moved on: another room shown, another ring. */
  follow(page: WorldPage): void {
    if (page === this.#page) return;
    this.#page = page;
    this.#update();
  }

  readonly subscribe = (told: () => void) => {
    this.#told = told;
    const stop = this.#page.store.subscribe(this.#update);
    const timer = setInterval(this.#update, AGAIN_MS);
    return () => {
      this.#told = () => undefined;
      stop();
      clearInterval(timer);
    };
  };

  readonly rooms = () => this.#moons.rooms;
}

// Where a moon's link stands, written only when it moved a pixel, showed or hid, or is another link: the scene calls it on every frame.
function placer(links: ReadonlyMap<string, HTMLAnchorElement>, room: string) {
  const last: { x: number; y: number; link: HTMLAnchorElement | undefined } = {
    x: Number.NaN,
    y: Number.NaN,
    link: undefined,
  };
  return (x: number, y: number, shown: boolean) => {
    const link = links.get(room);
    const left = Math.round(x);
    const top = Math.round(y);
    if (link === undefined || (link === last.link && left === last.x && top === last.y && link.hidden === !shown))
      return;
    last.link = link;
    last.x = left;
    last.y = top;
    link.style.translate = `${String(left)}px ${String(top)}px`;
    link.hidden = !shown;
  };
}

export function WorldMoons({ page, sky }: { page: WorldPage; sky: Sky }) {
  const [keeper] = useState(() => new MoonKeeper(page));
  useEffect(() => {
    keeper.follow(page);
  }, [keeper, page]);
  const rooms = useSyncExternalStore(keeper.subscribe, keeper.rooms);
  const chat = useSyncExternalStore(page.store.subscribe, () => page.store.getState().chat);
  const linksRef = useRef(new Map<string, HTMLAnchorElement>());
  const peopleOf = (room: string) => chat.rooms[room]?.members.length ?? 0;
  useEffect(() => {
    const busiest = Math.max(0, ...rooms.map((room) => chat.rooms[room]?.members.length ?? 0));
    sky.moons(
      rooms.map((room) => ({
        room,
        size: moonSize(chat.rooms[room]?.members.length ?? 0, busiest),
        place: placer(linksRef.current, room),
      })),
    );
  }, [sky, rooms, chat]);
  useEffect(
    () => () => {
      sky.moons([]);
    },
    [sky],
  );
  return (
    <nav aria-label="Rooms in orbit">
      <ul>
        {rooms.map((room) => (
          <li key={room}>
            <a
              ref={(link) => {
                if (link !== null) linksRef.current.set(room, link);
                return () => {
                  linksRef.current.delete(room);
                };
              }}
              className={styles["moon"]}
              href={hrefOf(page, room)}
              hidden
              onClick={(event) => {
                event.preventDefault();
                page.open(hrefOf(page, room));
              }}
            >
              {`#${nameOf(page, room)} · ${String(peopleOf(room))} here`}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
