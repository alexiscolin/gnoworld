// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { realmRoom } from "@gnoworld/core";
import { afterEach, expect, it, vi } from "vitest";
import { TalkBar } from "./TalkBar.tsx";

// The chat keeps its rooms by their whole id (#<world>/<name>); the bar reads the room of its realm's page and names it as the dock does.
const rooms: Record<string, { lines: { kind: string; from: string; text: string }[] }> = {};
vi.mock("../../storeContext.tsx", () => ({
  useApp: (select: (state: { chat: { rooms: typeof rooms } }) => unknown) => select({ chat: { rooms } }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PATH = "gno.land/r/samcrew/memba_appstore_v3";

afterEach(() => {
  document.body.replaceChildren();
  for (const key of Object.keys(rooms)) Reflect.deleteProperty(rooms, key);
});

function barText(room: string): string {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(createElement(TalkBar, { name: "memba_appstore_v3", room }));
  });
  return host.textContent;
}

it("reads the lines of the room the realm's chat keeps, by its whole id, and names it as the dock does", () => {
  const { room } = realmRoom(PATH, []);
  rooms[room] = { lines: [{ kind: "message", from: "ada", text: "hello there" }] };
  const text = barText(room);
  expect(text).toContain("ada: hello there");
  expect(text).toContain("in #memba-appstore-v3");
  expect(text).not.toContain("#memba_appstore_v3");
});
