// @vitest-environment jsdom
import { parseLine, type IrcMessage, type Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeAll, describe, expect, it } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { keep } from "../../lib/keep/keep.ts";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { useRoomKeeping } from "./RoomKeeping.ts";
import { useGuestKeeping } from "./RoomPins.ts";
import { RoomView, type RoomViewProps } from "./RoomView.tsx";

// 4d's marks on a room's lines (slice 4's 4d), apart from RoomView.test.tsx: a line saved or pinned says so in a word,
// and a line marked unread takes the New mark. `keeping` is what the room is told of the reader's device and the room's
// pins; a guest, and a direct message, are given none.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const line = (id: string, minute: number, over: Partial<Line> = {}): Line => ({
  id,
  time: T(minute),
  from: ALICE,
  account: ALICE,
  text: `text ${id}`,
  kind: "message",
  ...over,
});
const LINES = [line("a", 0), line("b", 1), line("c", 2), line("d", 3)];
// The places that leave line b, and line c, unread: the millisecond before each, as Ergo writes a time (4d's R18).
const BEFORE_B = "2026-10-25T10:00:59.999Z";
const BEFORE_C = "2026-10-25T10:01:59.999Z";
const none = () => undefined;
const keeping = (over: Partial<NonNullable<RoomViewProps["keeping"]>> = {}): NonNullable<RoomViewProps["keeping"]> => ({
  unread: undefined,
  saved: new Set(),
  pinned: new Set(),
  onSave: none,
  onUnsave: none,
  onMarkUnread: none,
  onReadThrough: none,
  ...over,
});
const room = (state: Partial<NonNullable<RoomViewProps["state"]>> = {}) => ({
  lines: LINES,
  members: [ALICE],
  read: T(3),
  paged: true as const,
  ...state,
});
const view = (over: Partial<RoomViewProps> = {}) =>
  renderToStaticMarkup(
    <RoomView
      room="#bubble/games"
      title="#games"
      state={room()}
      chat="connected"
      me={BOB}
      onDelete={() => false}
      onDismiss={() => undefined}
      {...over}
    />,
  );
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const items = (html: string) => {
  const list = /<ol[^>]*aria-label="Messages"[^>]*>(.*)<\/ol>/s.exec(html)?.[1] ?? "";
  return [...list.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => said(m[1] ?? ""));
};

// The lines view loads lazily (docs/decisions.md, 2026-10-26): drawn once and waited for, every view below draws it at once.
beforeAll(async () => {
  await prerender(
    <RoomView
      room="#bubble/games"
      title="#games"
      state={room()}
      chat="connected"
      onDelete={() => false}
      onDismiss={() => undefined}
    />,
  );
});

describe("the marks of a saved and a pinned line", () => {
  it("say Saved, in a word before the time, on the saved lines alone", () => {
    const rows = items(view({ keeping: keeping({ saved: new Set(["b", "d"]) }) }));
    expect(rows.map((row) => /^Saved \d{2}:\d{2} /.test(row))).toEqual([false, true, false, true]);
    expect(view({ keeping: keeping({ saved: new Set(["b"]) }) })).toContain('data-icon="bookmark"');
  });

  it("say Pinned, in a word before the time, on the pinned lines alone, to every reader", () => {
    const html = view({ keeping: keeping({ pinned: new Set(["c"]) }) });
    expect(items(html).map((row) => /^Pinned \d{2}:\d{2} /.test(row))).toEqual([false, false, true, false]);
    expect(html).toContain('data-icon="pin"');
    // A guest has no keeping, and reads the pin's word all the same, from the room's own pins.
    expect(items(view({ me: undefined, keeping: keeping({ pinned: new Set(["c"]) }) }))[2]).toMatch(/^Pinned /);
  });

  it("say both on a line that is saved and pinned, and neither on a room given none", () => {
    expect(items(view({ keeping: keeping({ saved: new Set(["a"]), pinned: new Set(["a"]) }) }))[0]).toMatch(
      /^(Saved Pinned|Pinned Saved) /,
    );
    const plain = items(view());
    expect(plain.join(" ")).not.toMatch(/Saved|Pinned/);
  });

  // A line's own words are the sender's: a line that says "Saved" is no saved line.
  it("never mistake a line's own words for the mark", () => {
    const rows = items(view({ state: room({ lines: [line("a", 0, { text: "Saved Pinned" })] }) }));
    expect(rows[0]).toMatch(/^\d{2}:\d{2} /);
  });
});

describe("a line marked unread", () => {
  it("takes the New mark, though Ergo's place is at the end of the room", () => {
    expect(items(view()).filter((row) => row.startsWith("New "))).toEqual([]);
    const rows = items(view({ keeping: keeping({ unread: BEFORE_B }) }));
    expect(rows.map((row) => row.startsWith("New "))).toEqual([false, true, false, false]);
    expect(rows[1]).toMatch(/^New from here \d{2}:\d{2} /);
  });

  it("is the earlier of the two places: Ergo's place behind the device's wins, and the device's behind Ergo's", () => {
    const behind = view({ state: room({ read: T(0) }), keeping: keeping({ unread: BEFORE_C }) });
    expect(items(behind).map((row) => row.startsWith("New "))).toEqual([false, true, false, false]);
    const ahead = view({ state: room({ read: T(2) }), keeping: keeping({ unread: BEFORE_B }) });
    expect(items(ahead).map((row) => row.startsWith("New "))).toEqual([false, true, false, false]);
  });

  it("takes the New mark where Ergo knows no place for the room", () => {
    const rows = items(view({ state: room({ read: undefined }), keeping: keeping({ unread: BEFORE_C }) }));
    expect(rows.map((row) => row.startsWith("New "))).toEqual([false, false, true, false]);
  });

  it("waits for the room's history, as Ergo's place does: no New mark before it came", () => {
    const html = view({ state: room({ paged: undefined }), keeping: keeping({ unread: BEFORE_B }) });
    expect(items(html).filter((row) => row.startsWith("New "))).toEqual([]);
  });

  it("marks one line New only, and marks none for a reader given no keeping", () => {
    const html = view({ keeping: keeping({ unread: BEFORE_B }) });
    expect(html.match(/data-new=""/g)).toHaveLength(1);
    expect(view({ me: undefined })).not.toContain("data-new");
  });
});

// What the page hands the room in view, from the store: nothing for a room that is none (a direct message), and for a room
// the device's places and lines, the pins, and Pin only where the server said the reader may.
const NO_PINNING = {
  pin: () => Promise.resolve({ ok: true as const }),
  unpin: () => Promise.resolve({ ok: true as const }),
};
type Keeps = typeof useRoomKeeping;
function Probe({
  room,
  seed,
  keeps = useRoomKeeping,
}: {
  room: string | undefined;
  seed?: (store: ReturnType<typeof useAppStore>) => void;
  keeps?: Keeps;
}) {
  const store = useAppStore();
  useEffect(() => {
    seed?.(store);
  }, [seed, store]);
  const { keeping, pins } = keeps(room, NO_PINNING);
  return (
    <p>
      {JSON.stringify({
        keeping:
          keeping === undefined
            ? null
            : { saved: [...keeping.saved], pinned: [...keeping.pinned], pin: keeping.pin !== undefined },
        pins: pins ?? null,
      })}
    </p>
  );
}
const probed = (room: string | undefined, seed?: (store: ReturnType<typeof useAppStore>) => void, keeps?: Keeps) =>
  renderToStaticMarkup(
    <StoreProvider>
      <Probe room={room} {...(seed === undefined ? {} : { seed })} {...(keeps === undefined ? {} : { keeps })} />
    </StoreProvider>,
  );

describe("the room in view's keeping, from the store", () => {
  it("is none for no room, a direct message's, which has neither", () => {
    expect(probed(undefined)).toBe("<p>{&quot;keeping&quot;:null,&quot;pins&quot;:null}</p>");
  });

  it("is none for a visitor too, and holds nothing for a room none has been told of", () => {
    expect(probed(undefined, undefined, useGuestKeeping)).toBe(
      "<p>{&quot;keeping&quot;:null,&quot;pins&quot;:null}</p>",
    );
    expect(probed("#bubble", undefined, useGuestKeeping)).toBe(probed("#bubble"));
  });

  it("holds nothing saved or pinned and offers no Pin before the server has answered for the room", () => {
    expect(probed("#bubble")).toBe(
      "<p>{&quot;keeping&quot;:{&quot;saved&quot;:[],&quot;pinned&quot;:[],&quot;pin&quot;:false},&quot;pins&quot;:null}</p>",
    );
  });

  // A line's id is its room's: the same id saved in another room marks nothing here (G13).
  it("marks a line saved only in the room it was saved in, though another room saved another line", () => {
    const seed = (store: ReturnType<typeof useAppStore>) => {
      const kept = new Map<string, string>();
      const storage = {
        getItem: (key: string) => kept.get(key) ?? null,
        setItem: (key: string, value: string) => void kept.set(key, value),
        removeItem: (key: string) => void kept.delete(key),
      };
      const { keepActions } = store.getState();
      keepActions.begin(keep(() => storage, Address.parse(ALICE)));
      keepActions.save("#bubble", line("same", 0));
      keepActions.save("#bubble/games", line("other", 1));
    };
    // Rendered on the client: a pre-render reads the store's first state, which holds no seed.
    const saved = (room: string) => {
      const host = document.createElement("div");
      const root = createRoot(host);
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      act(() => {
        root.render(
          <StoreProvider>
            <Probe room={room} seed={seed} />
          </StoreProvider>,
        );
      });
      const held = z.object({ keeping: z.object({ saved: z.array(z.string()) }) }).parse(JSON.parse(host.textContent));
      act(() => {
        root.unmount();
      });
      return held.keeping.saved;
    };
    expect(saved("#bubble")).toEqual(["same"]);
    expect(saved("#bubble/games")).toEqual(["other"]);
    expect(saved("#world")).toEqual([]);
  });
});

// An edit is a line of its own that corrects one (+gnoworld/edit): the room shows the corrected text in the first line's
// place, but Ergo keeps the first at its id. What the reader saves, marks and pins is the version the room shows, and a
// pin is of the newest version's id (F1483, the code review's CR1).
describe("the version of an edited line that the room acts on", () => {
  const said = (id: string, text: string, edits?: string): IrcMessage => {
    const tags = `msgid=${id};time=2026-10-25T10:00:0${id.slice(1)}.000Z;account=${ALICE}${edits === undefined ? "" : `;+gnoworld/edit=${edits}`}`;
    const parsed = parseLine(`@${tags} :alice!u@h PRIVMSG #bubble :${text}`);
    if (!parsed.ok) throw new Error("the test's line does not parse");
    return parsed.message;
  };
  // The room's lines are m1, then m2 and m3, the author's edits of it; the store holds m2 and m3's pin.
  function mounted(lines: readonly IrcMessage[], pinned: readonly string[] = [], keeps: Keeps = useRoomKeeping) {
    const calls: string[] = [];
    const pinning = {
      pin: (id: string) => {
        calls.push(`pin ${id}`);
        return Promise.resolve({ ok: true as const });
      },
      unpin: (id: string) => {
        calls.push(`unpin ${id}`);
        return Promise.resolve({ ok: true as const });
      },
    };
    const seen: { api?: ReturnType<typeof useRoomKeeping>; store?: ReturnType<typeof useAppStore> } = {};
    const Reader = () => {
      const store = useAppStore();
      const api = keeps("#bubble", pinning);
      useEffect(() => {
        Object.assign(seen, { api, store });
      });
      return null;
    };
    const root = createRoot(document.createElement("div"));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    act(() => {
      root.render(
        <StoreProvider>
          <Reader />
        </StoreProvider>,
      );
    });
    const kept: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => kept[key] ?? null,
      setItem: (key: string, value: string) => {
        kept[key] = value;
      },
      removeItem: (key: string) => Reflect.deleteProperty(kept, key),
    };
    const state = seen.store?.getState();
    act(() => {
      state?.keepActions.begin(keep(() => storage, Address.parse(ALICE)));
      state?.chatActions.follow(["#bubble"]);
      state?.chatActions.page("#bubble", lines);
      state?.pinsActions.set({
        room: "#bubble",
        may: true,
        pins: pinned.map((id) => ({ id, time: T(0), account: Address.parse(ALICE), text: `held ${id}` })),
      });
    });
    return {
      calls,
      keeping: () => seen.api?.keeping,
      pins: () => seen.api?.pins,
      saved: () => seen.store?.getState().keep.saved ?? [],
      unread: () => seen.store?.getState().keep.unread ?? {},
    };
  }
  const EDITED = [said("m1", "my address is 12 Foo St"), said("m2", "never mind", "m1")];

  it("saves the text its author corrected an edited line to, never the one taken back", () => {
    const { keeping, saved } = mounted(EDITED);
    act(() => {
      keeping()?.onSave("m1");
    });
    expect(saved().map(({ id, text }) => [id, text])).toEqual([["m1", "never mind"]]);
  });

  it("pins an edited line by its newest edit's id, the older one being the text taken back", async () => {
    const { keeping, calls } = mounted([...EDITED, said("m3", "never mind, really", "m1")]);
    await act(async () => {
      await keeping()?.pin?.pin("m1");
    });
    expect(calls).toEqual(["pin m3"]);
  });

  it("shows the edited line pinned and unpins the id the server holds, the edit's", async () => {
    const { keeping, calls } = mounted(EDITED, ["m2"]);
    expect([...(keeping()?.pinned ?? [])]).toEqual(["m1"]);
    await act(async () => {
      await keeping()?.pin?.unpin("m1");
    });
    expect(calls).toEqual(["unpin m2"]);
  });

  // A visitor reads the pins as an account does, and keeps nothing: no Pin though the server says it may, no saved line.
  it("shows a visitor the edited line pinned and the pin held, with nothing to pin, save or unmark", () => {
    const { keeping, pins } = mounted(EDITED, ["m2"], useGuestKeeping);
    expect([...(keeping()?.pinned ?? [])]).toEqual(["m1"]);
    expect(pins()?.list.map(({ id }) => id)).toEqual(["m2"]);
    expect(keeping()?.pin).toBeUndefined();
    expect(keeping()?.saved.size).toBe(0);
    expect(keeping()?.unread).toBeUndefined();
    expect(keeping()?.onSave("m1")).toBe("none");
  });

  const by = (account: string, message: IrcMessage): IrcMessage => ({
    ...message,
    tags: new Map(message.tags).set("account", account),
  });
  // R9 of redpass2-4dx: Mark unread reads the line as the room shows it, which is the first line's own place; an edit
  // folded into it is no line of the room's.
  it("marks an edited line unread at its own time, and marks none for an edit the room does not show", () => {
    const { keeping, unread } = mounted(EDITED);
    act(() => {
      keeping()?.onMarkUnread("m2");
    });
    expect(unread()).toEqual({});
    act(() => {
      keeping()?.onMarkUnread("m1");
    });
    expect(unread()).toEqual({ "#bubble": "2026-10-25T10:00:00.999Z" });
  });

  it("pins and unpins a line that is no edited one by its own id", async () => {
    const { keeping, calls } = mounted([said("m1", "plain")], ["m1"]);
    await act(async () => {
      await keeping()?.pin?.pin("m1");
      await keeping()?.pin?.unpin("m1");
    });
    expect(calls).toEqual(["pin m1", "unpin m1"]);
  });

  it("leaves a line's id alone for an edit by another account, which the room shows as a line of its own", async () => {
    const { keeping, calls } = mounted([said("m1", "mine"), by(BOB, said("m2", "not mine", "m1"))]);
    await act(async () => {
      await keeping()?.pin?.pin("m1");
    });
    expect(calls).toEqual(["pin m1"]);
  });
});
