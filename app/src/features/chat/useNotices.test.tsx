// @vitest-environment jsdom
// 4f-n (G11): the hook that tells the page what the account has not seen, on the real store, rendered in jsdom.
import { Address } from "@gnoworld/schemas";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppState } from "../../store/index.ts";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import type { Dms } from "./Dms.tsx";
import { useNotices, type Noticing } from "./useNotices.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const GAMES = "#bubble/games";
const NEWS = "#bubble/news";
const MAIN = "#bubble";
const TITLE = "Bubble";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const SECTIONS = [
  {
    name: null,
    rooms: [
      { room: MAIN, type: "open" as const },
      { room: GAMES, type: "open" as const },
    ],
  },
];
const NO_DMS: Dms = {
  partner: undefined,
  nav: undefined,
  lines: [],
  empty: "",
  refused: undefined,
  problem: undefined,
};

type On = Parameters<typeof useNotices>[0];
let root: Root | undefined;
// What the probe saw as its last render committed: the store, and what the hook told.
const held: { store?: ReturnType<typeof useAppStore>; told?: Noticing } = {};
const store = () => {
  if (held.store === undefined) throw new Error("nothing drawn");
  return held.store;
};
const told = (): Noticing => {
  if (held.told === undefined) throw new Error("nothing drawn");
  return held.told;
};
const on = (over: Partial<On> = {}): On => ({
  world: "bubble",
  session: { kind: "in", address: Address.parse(ME) },
  sections: SECTIONS,
  dms: NO_DMS,
  current: GAMES,
  ...over,
});
function Probe({ at }: { at: On }) {
  const here = useAppStore();
  const noticing = useNotices(at);
  useEffect(() => {
    held.store = here;
    held.told = noticing;
  });
  return null;
}
const draw = (at: On) => {
  root ??= createRoot(document.body.appendChild(document.createElement("div")));
  const drawn = root;
  act(() => {
    drawn.render(
      <StoreProvider>
        <Probe at={at} />
      </StoreProvider>,
    );
  });
};
// The account's session on the store: connected, the rooms followed, then what happened.
const tell = (what: (state: AppState) => void) => {
  act(() => {
    what(store().getState());
  });
};
const mention = (id: string, where: string, minute = 5) =>
  ({ id, kind: "mention", where, time: T(minute), by: ALICE }) as const;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.title = TITLE;
});
// The page leaves the chat: its hooks' cleanups run.
const leave = () => {
  const drawn = root;
  root = undefined;
  if (drawn === undefined) return;
  act(() => {
    drawn.unmount();
  });
};
afterEach(() => {
  leave();
  document.body.replaceChildren();
});

describe("useNotices", () => {
  const follow = () => {
    tell(({ chatActions }) => {
      chatActions.connected(ME);
      chatActions.follow([MAIN, GAMES, NEWS]);
    });
  };

  // F1512: a guest's list was a new `[]` each render, so useAnnounced set its state on it again and again; only the
  // compiler of the build, which keeps the one array, hid the loop (the test renders as written).
  it("draws for a guest without looping on a list made anew each render, and tells it nothing", () => {
    draw(on({ session: { kind: "out" } }));
    follow();
    tell(({ noticeActions }) => {
      noticeActions.add(mention("a", GAMES));
    });
    expect(told().badges).toBeUndefined();
    expect(told().list).toBeUndefined();
    expect(told().notify).toBeUndefined();
    expect(document.title).toBe(TITLE);
  });

  it("counts each room and conversation, lists the notices, and puts the total in the title", () => {
    draw(on());
    follow();
    tell(({ noticeActions }) => {
      noticeActions.add(mention("a", MAIN));
      noticeActions.add(mention("b", MAIN, 6));
      noticeActions.add({ ...mention("d", ALICE), kind: "dm" });
    });
    draw(
      on({
        dms: {
          ...NO_DMS,
          nav: {
            world: "bubble",
            partners: [ALICE],
            current: undefined,
            onlyKnown: false,
            onOnlyKnown: () => undefined,
          },
        },
      }),
    );
    expect(told().badges).toEqual({ [MAIN]: 2, [GAMES]: 0, [ALICE]: 1 });
    expect(told().list?.list.map(({ id }) => id)).toEqual(["a", "b", "d"]);
    expect(document.title).toBe(`(3) ${TITLE}`);
  });

  it("takes the count off the title as the page leaves the chat", () => {
    draw(on());
    follow();
    tell(({ noticeActions }) => {
      noticeActions.add(mention("a", MAIN));
    });
    expect(document.title).toBe(`(1) ${TITLE}`);
    leave();
    expect(document.title).toBe(TITLE);
  });

  it("counts nothing for an account whose page holds no room list and no conversation yet", () => {
    draw(on({ sections: undefined }));
    follow();
    expect(told().badges).toEqual({});
    expect(told().list?.list).toEqual([]);
  });

  it("hands the page's seen to a guest as to an account", () => {
    draw(on({ session: { kind: "out" } }));
    act(() => {
      told().seen(ALICE, T(3));
    });
    expect(store().getState().noticeSeen).toEqual({ [ALICE]: T(3) });
  });

  it("gives the room in view's mode, and none while a conversation is in view", () => {
    draw(on());
    follow();
    expect(told().notify?.mode).toBe("mentions");
    expect(told().notify?.notKept).toBe(false);
    act(() => {
      told().notify?.onMode("all");
    });
    expect(told().notify?.mode).toBe("all");
    draw(on({ dms: { ...NO_DMS, partner: ALICE } }));
    expect(told().notify).toBeUndefined();
    draw(on({ dms: { ...NO_DMS, problem: "no such account" } }));
    expect(told().notify).toBeUndefined();
  });

  it("says a notice that comes for a place out of view, once, and none for the place in view", () => {
    draw(on());
    follow();
    expect(told().list?.said).toBe("");
    tell(({ noticeActions }) => {
      noticeActions.add(mention("a", GAMES));
    });
    expect(told().list?.said).toBe("");
    tell(({ noticeActions }) => {
      noticeActions.add(mention("b", MAIN, 6));
    });
    expect(told().list?.said).toBe("g10gh7…3y5tv mentioned you in #bubble");
    tell(({ noticeActions }) => {
      noticeActions.add(mention("c", GAMES, 7));
    });
    expect(told().list?.said).toBe("g10gh7…3y5tv mentioned you in #bubble");
  });

  it("goes on saying the newest notice that came, not an older one still listed, as that one is seen", () => {
    draw(on());
    follow();
    tell(({ noticeActions }) => {
      noticeActions.add(mention("a", MAIN));
      noticeActions.add(mention("b", NEWS, 6));
    });
    expect(told().list?.said).toBe("g10gh7…3y5tv mentioned you in #news");
    tell(({ noticeActions }) => {
      noticeActions.seen(NEWS, T(6));
    });
    expect(told().list?.list.map(({ id }) => id)).toEqual(["a"]);
    expect(told().list?.said).toBe("g10gh7…3y5tv mentioned you in #news");
  });
});
