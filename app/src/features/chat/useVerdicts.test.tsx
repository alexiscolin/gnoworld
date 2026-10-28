// @vitest-environment jsdom
import type { Line } from "@gnoworld/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { useVerdicts, type Shown } from "./useVerdicts.ts";

// The verdicts' asker reads a line's Markdown for a player's link: that code is asked once a room holds a line, never
// with the first screen (ADR-0001 §12), while the room's stream is followed as the room is shown.
const asked: string[][] = [];
const followed: string[][] = [];
vi.mock("../../lib/api/verdicts.ts", () => ({
  pageVerdictsApi: () => ({
    verdicts: (_room: string, ids: readonly string[]) => {
      asked.push([...ids]);
      return Promise.resolve({ ok: true, value: { room: "#bubble", verdicts: [] } });
    },
  }),
}));
vi.mock("../../lib/stream/verdicts.ts", () => ({
  pageVerdicts: (rooms: string[], on: { since: (time: number) => void }) => {
    followed.push(rooms);
    on.since(Date.parse("2026-10-26T12:00:00.000Z"));
    return () => undefined;
  },
}));

const line = (id: string, text: string): Line => ({
  id,
  time: "2026-10-26T11:00:00.000Z",
  from: "a",
  text,
  kind: "message",
});
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

const store = createAppStore();
function Probe({ shown }: { shown: Shown }) {
  useVerdicts(store, shown);
  return null;
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  asked.length = 0;
  followed.length = 0;
});

describe("useVerdicts: the code that finds a link in a line, asked with the first lines", () => {
  const draw = async (lines: readonly Line[] | undefined) => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<Probe shown={{ room: "#bubble", lines, reader: undefined, saving: false }} />);
      await settled();
    });
    return root;
  };

  it("follows the room's stream before any line, and asks nothing", async () => {
    await draw([]);
    expect(followed).toEqual([["#bubble"]]);
    expect(asked).toEqual([]);
  });

  it("asks the server of the line that holds a link, once the code came, and of none other", async () => {
    await draw([line("a", "https://youtu.be/dQw4w9WgXcQ"), line("b", "only words")]);
    // The chunk's first import takes the time of its transform.
    await vi.waitFor(() => {
      expect(asked).toEqual([["a"]]);
    });
    expect(followed).toEqual([["#bubble"]]);
  });
});
