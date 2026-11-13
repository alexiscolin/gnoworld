// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { all, click, mount, popovers } from "../tests/mount.tsx";
import { QuickActions } from "./features/chat/QuickActions.tsx";
import { Opened } from "./features/account/Opened.tsx";
import {
  addJarvisItem,
  jarvisItems,
  setJarvisDrawing,
  settleJarvisItem,
  useJarvisDrawing,
  useJarvisItems,
  type JarvisItem,
} from "./jarvisHere.ts";

// 10u-a: the cards of Jarvis the page keeps, and where Jarvis opens from, and when it does not. No pill in the header (D342, D343): the account menu's Jarvis and the chat's
// quick actions Jarvis and Catch up. Off, or not known yet, they stay greyed "soon" as today, and nothing opens. Kept apart from
// QuickActions.test.tsx and AccountMenu.test.tsx, which are display-only (vitest.config.ts).
const items = (box: HTMLElement) => all(box, '[role="menuitem"]');
const named = (box: HTMLElement, name: string) => items(box).find((item) => item.textContent.startsWith(name));
const greyed = (item: HTMLElement | undefined) => item?.getAttribute("aria-disabled") === "true";

beforeAll(() => {
  popovers();
  vi.stubGlobal("reportError", vi.fn());
});

const card = (over: Partial<Omit<JarvisItem, "id" | "at">> = {}): Omit<JarvisItem, "id" | "at"> => ({
  room: "#store",
  account: "g1me",
  ask: { ask: "here", room: "#store" },
  ...over,
});
const Cards = ({ room, account }: { room: string | undefined; account: string | undefined }) => (
  <p>
    {useJarvisItems(room, account)
      .map(({ id }) => id)
      .join(",")}
  </p>
);
const Drawn = () => <p>{useJarvisDrawing()?.({ ...card(), id: "x", at: "" }) ?? "none"}</p>;

describe("Jarvis's cards", () => {
  it("are shown to the account that asked, in the room it asked in, and to nobody else", () => {
    const s1 = addJarvisItem(card({ room: "#r1" }));
    const s2 = addJarvisItem(card({ room: "#r2" }));
    const s3 = addJarvisItem(card({ room: "#r1", account: "g1you" }));
    const s4 = addJarvisItem(card({ room: "#r1", account: undefined }));
    expect(mount(<Cards room="#r1" account="g1me" />).textContent).toBe(s1);
    expect(mount(<Cards room="#r1" account="g1you" />).textContent).toBe(s3);
    expect(mount(<Cards room="#r1" account={undefined} />).textContent).toBe(s4);
    expect(mount(<Cards room="#r2" account="g1me" />).textContent).toBe(s2);
    expect(mount(<Cards room={undefined} account="g1me" />).textContent).toBe("");
  });

  it("are given an id of their own and the moment they were added, so none is the same as another", () => {
    const before = Date.now();
    const [a, b] = [addJarvisItem(card()), addJarvisItem(card())];
    expect(a).not.toBe(b);
    const at = jarvisItems().find((item) => item.id === a)?.at ?? "";
    expect(Date.parse(at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(at)).toBeLessThanOrEqual(Date.now());
  });

  it("are settled by their own id, once: another ask's answer never takes a pending ask's place", () => {
    const [p1, p2] = [addJarvisItem(card()), addJarvisItem(card())];
    const first = { ok: false, reason: "network" } as const;
    const late = { ok: true, value: { status: "off" } } as const;
    settleJarvisItem(p1, first);
    settleJarvisItem(p1, late);
    settleJarvisItem("nobody", late);
    const by = (id: string) => jarvisItems().find((item) => item.id === id);
    expect(by(p1)?.result).toBe(first);
    expect(by(p2)?.result).toBeUndefined();
  });

  it("are drawn as the host says, and by none before it has said", () => {
    expect(mount(<Drawn />).textContent).toBe("none");
    act(() => {
      setJarvisDrawing(() => "drawn");
    });
    expect(mount(<Drawn />).textContent).toBe("drawn");
    act(() => {
      setJarvisDrawing(undefined);
    });
  });
});

describe("the quick actions' Jarvis and Catch up", () => {
  const draw = (pills: "earth" | "realm" | "hub" | "dm", jarvis?: (what: "intro" | "catch-up") => void) =>
    mount(
      <MemoryRouter>
        <QuickActions pills={pills} jarvis={jarvis} />
      </MemoryRouter>,
    );

  it("are greyed soon while Jarvis is off or has no room: pressed, nothing opens", () => {
    const box = draw("realm");
    expect([named(box, "Jarvis"), named(box, "Catch up")].map(greyed)).toEqual([true, true]);
    click(named(box, "Jarvis"));
    click(named(box, "Catch up"));
    expect(all(box, "dialog[open]")).toEqual([]);
  });

  it("open Jarvis once it is on: Jarvis in every room's row, Catch up in a world's", () => {
    const open = vi.fn();
    const box = draw("realm", open);
    expect([named(box, "Jarvis"), named(box, "Catch up")].map(greyed)).toEqual([false, false]);
    click(named(box, "Jarvis"));
    click(named(box, "Catch up"));
    expect(open.mock.calls).toEqual([["intro"], ["catch-up"]]);
    expect(greyed(named(draw("earth", open), "Jarvis"))).toBe(false);
    expect(greyed(named(draw("hub", open), "Catch up"))).toBe(false);
  });

  it("give a direct message none: Jarvis reads rooms", () => {
    expect(items(draw("dm", vi.fn())).map((item) => item.textContent.replace(/Soon$/, ""))).toEqual(["Image"]);
  });
});

describe("the account menu's Jarvis", () => {
  const draw = (onJarvis?: () => void) =>
    mount(
      <MemoryRouter>
        <Opened
          address={undefined}
          lead={null}
          onLogOut={() => undefined}
          {...(onJarvis === undefined ? {} : { onJarvis })}
        />
      </MemoryRouter>,
    );

  it("is greyed soon while Jarvis is off, as today", () => {
    expect(greyed(named(draw(), "Jarvis"))).toBe(true);
  });

  it("opens the panel once it is on", () => {
    const open = vi.fn();
    const box = draw(open);
    expect(greyed(named(box, "Jarvis"))).toBe(false);
    click(named(box, "Jarvis"));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
