// @vitest-environment jsdom
import { moonSize } from "@gnoworld/core";
import { shortAddress, type RoomList } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { all, mount } from "../../../tests/mount.tsx";
import type { MoonMark } from "../../scene/world/view.ts";
import { createAppStore } from "../../store/index.ts";
import { WorldMoons } from "./WorldMoons.tsx";

// A world's rooms as moons (ADR-0002 §1, "Rooms as moons"): links over the scene, each placed where its moon is, joining its room through
// the page's router. Only the rooms the world lists are moons: a realm of the world has no room, so no moon. Names are text, never markup.
const listed = (...rooms: string[]): RoomList["sections"] => [
  { name: null, rooms: rooms.map((room) => ({ room, type: "open" as const })) },
];

// Each followed room's people, by its id.
function seat(store: ReturnType<typeof createAppStore>, membersOf: (id: string) => string[]) {
  store.setState((state) => ({
    chat: {
      ...state.chat,
      rooms: Object.fromEntries(
        Object.entries(state.chat.rooms).map(([id, held]) => [id, { ...held, members: membersOf(id) }]),
      ),
    },
  }));
}

function world(rooms: Record<string, number>, room: string | null = null) {
  const store = createAppStore();
  const ids = Object.keys(rooms);
  store.getState().chatActions.follow(ids);
  store.getState().chatActions.listed(listed(...ids));
  seat(store, (id) => Array.from({ length: rooms[id] ?? 0 }, (_, at) => `guest-${String(at)}`));
  const open = vi.fn<(href: string) => void>();
  const moons = vi.fn<(marks: readonly MoonMark[]) => void>();
  const box = mount(
    <WorldMoons page={{ store, open, slug: "bubble", room, universe: "onyx", path: "/w/bubble" }} sky={{ moons }} />,
  );
  return { box, store, open, moons };
}

const lastMarks = (moons: { mock: { calls: (readonly [readonly MoonMark[]])[] } }) =>
  moons.mock.calls.at(-1)?.[0] ?? [];
function never(): never {
  throw new Error("a followed room is missing");
}

const links = (box: HTMLElement) => all(box, "nav[aria-label='Rooms in orbit'] a");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a world's rooms as moons", () => {
  it("makes a link of each moon, the room you are in among them, and a moon of a room with nobody only for that one", () => {
    const { box } = world({ "#bubble": 3, "#bubble/games": 5, "#bubble/art": 0 });
    expect(links(box).map((link) => link.textContent)).toEqual(["#bubble · 3 here", "#games · 5 here"]);
  });

  it("joins a room through the page's router, at the room's own address", () => {
    const { box, open } = world({ "#bubble": 3, "#bubble/games": 5 });
    const games = links(box).find((link) => link.textContent.startsWith("#games"));
    expect(games?.getAttribute("href")).toBe("/w/bubble?room=games");
    const clicked = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      games?.dispatchEvent(clicked);
    });
    expect(clicked.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith("/w/bubble?room=games");
    const main = links(box).find((link) => link.textContent.startsWith("#bubble"));
    expect(main?.getAttribute("href")).toBe("/w/bubble");
  });

  it("hands the scene one mark a moon, sized by its people against the busiest room", () => {
    const { moons } = world({ "#bubble": 3, "#bubble/games": 5 });
    const marks = lastMarks(moons);
    expect(marks.map(({ room, size }) => [room, size])).toEqual([
      ["#bubble", moonSize(3, 5)],
      ["#bubble/games", moonSize(5, 5)],
    ]);
  });

  it("stands each link where the scene places its moon, and hides it where the scene does", () => {
    const { box, moons } = world({ "#bubble": 3 });
    const [mark] = lastMarks(moons);
    const [link] = links(box);
    act(() => {
      mark?.place(700, 300, true);
    });
    expect(link?.style.translate).toBe("700px 300px");
    expect(link?.hidden).toBe(false);
    act(() => {
      mark?.place(500, 300, false);
    });
    expect(link?.hidden).toBe(true);
  });

  it("writes a link's place only when it moved a whole pixel, showed or hid: the scene places it on every frame (F3615)", () => {
    const { box, moons } = world({ "#bubble/games": 2 });
    const link = links(box)[0];
    const place = (x: number, y: number, shown: boolean) => {
      act(() => {
        lastMarks(moons)[0]?.place(x, y, shown);
      });
    };
    place(700.2, 300, true);
    expect(link?.style.translate).toBe("700px 300px");
    if (link !== undefined) link.style.translate = "1px 1px";
    place(700.4, 300.3, true);
    expect(link?.style.translate, "still on the same pixel: nothing written").toBe("1px 1px");
    place(700.4, 300.3, false);
    expect(link?.hidden).toBe(true);
    place(701, 300, false);
    expect(link?.style.translate).toBe("701px 300px");
  });

  it("makes one moon of a world whose realms are three and whose rooms are one", () => {
    const { box } = world({ "#bubble": 4 });
    expect(links(box)).toHaveLength(1);
  });

  it("reads a room's name as text and its address through the URL's own encoding", () => {
    const hostile = '#bubble/"><img src=x onerror=alert(1)>&room=x';
    const { box } = world({ "#bubble": 1, [hostile]: 9 });
    expect(all(box, "img")).toEqual([]);
    const link = links(box).find((each) => each.textContent.includes("img"));
    expect(link?.textContent).toBe(`${hostile.slice("#bubble/".length).replace(/^/, "#")} · 9 here`);
    const href = new URL(link?.getAttribute("href") ?? "", "https://gno.world");
    expect(href.pathname).toBe("/w/bubble");
    expect([...href.searchParams.keys()]).toEqual(["room"]);
    expect(href.searchParams.get("room")).toBe(hostile.slice("#bubble/".length));
  });

  it("follows the page to the room it shows (B1-3)", () => {
    const store = createAppStore();
    store.getState().chatActions.follow(["#bubble", "#bubble/games"]);
    store.getState().chatActions.listed(listed("#bubble", "#bubble/games"));
    const moons = vi.fn<(marks: readonly MoonMark[]) => void>();
    const page = { store, open: vi.fn(), slug: "bubble", room: null, universe: "onyx", path: "/w/bubble" };
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(<WorldMoons page={page} sky={{ moons }} />);
    });
    act(() => {
      root.render(<WorldMoons page={{ ...page, room: "games" }} sky={{ moons }} />);
    });
    expect(lastMarks(moons).map(({ room }) => room)).toContain("#bubble/games");
    act(() => {
      root.unmount();
    });
  });

  it("asks the moons again as time passes, so a room busy long enough takes its place (B1-3)", () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 2) });
    const { moons, store } = world({ "#bubble": 9, "#bubble/a": 8, "#bubble/b": 7, "#bubble/c": 6, "#bubble/d": 0 });
    act(() => {
      store.setState((state) => ({
        chat: {
          ...state.chat,
          rooms: {
            ...state.chat.rooms,
            "#bubble/d": {
              ...(state.chat.rooms["#bubble/d"] ?? never()),
              members: Array.from({ length: 30 }, (_, at) => `g${String(at)}`),
            },
          },
        },
      }));
    });
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(lastMarks(moons).map(({ room }) => room)).toContain("#bubble/d");
    vi.useRealTimers();
  });

  it("takes its moons back from the scene when it leaves, and stops listening to the store", () => {
    const store = createAppStore();
    store.getState().chatActions.follow(["#bubble"]);
    store.getState().chatActions.listed(listed("#bubble"));
    const moons = vi.fn<(marks: readonly MoonMark[]) => void>();
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(
        <WorldMoons
          page={{ store, open: vi.fn(), slug: "bubble", room: null, universe: "onyx", path: "/w/bubble" }}
          sky={{ moons }}
        />,
      );
    });
    expect(lastMarks(moons)).toHaveLength(1);
    act(() => {
      root.unmount();
    });
    expect(moons).toHaveBeenLastCalledWith([]);
    // And it stops listening to the store (B1-3).
    const after = moons.mock.calls.length;
    act(() => {
      store.getState().chatActions.listed(listed("#bubble", "#bubble/games"));
    });
    expect(moons.mock.calls.length).toBe(after);
  });
});

// "noor is here" (slice 8): a followed account among a room's people puts a chip on its moon, from what the page already holds.
describe("a followed person on a room's moon", () => {
  const NOOR = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const ALI = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const withPeople = (follows: string[], members: Record<string, string[]>) => {
    const made = world({ "#bubble": 1, "#bubble/games": 1 });
    act(() => {
      made.store.getState().deviceActions.change("follows", (held) => ({ ...held, people: follows }));
      seat(made.store, (id) => members[id] ?? []);
    });
    return links(made.box).map((link) => link.textContent);
  };

  it("says who is here on the moon of the room they are in, and on no other", () => {
    expect(withPeople([NOOR], { "#bubble": ["guest-1", NOOR], "#bubble/games": ["guest-2"] })).toEqual([
      `#bubble · 2 here ${shortAddress(NOOR)} is here`,
      "#games · 1 here",
    ]);
  });

  it("names the first of the people followed when several are in the room", () => {
    const here = { "#bubble": [NOOR, ALI], "#bubble/games": [] };
    expect(withPeople([ALI, NOOR], here)[0]).toContain(shortAddress(ALI));
    expect(withPeople([NOOR, ALI], here)[0]).toContain(shortAddress(NOOR));
  });

  it("says nothing of a guest's nick or of a person not followed", () => {
    expect(withPeople([NOOR], { "#bubble": ["guest-1", ALI], "#bubble/games": [] })).toEqual([
      "#bubble · 2 here",
      "#games · 0 here",
    ]);
  });
});
