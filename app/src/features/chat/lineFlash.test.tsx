import type { Line } from "@gnoworld/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LINES_KEPT } from "../../store/chat.ts";
import { useRemoval } from "./lineFlash.ts";

const line = (id: string): Line => ({ id, time: "2026-10-25T10:00:01.000Z", from: "a", text: id, kind: "message" });
const LINES = [line("m1"), line("m2")];

// A button that deletes m1 and says which line waits for its answer, the chat connected or not, a line refused or not.
function Waiting({ connected, refused }: { connected: boolean; refused?: string }) {
  const [deleting, remove] = useRemoval({
    lines: LINES,
    refused,
    connected,
    onDelete: () => true,
    leave: () => undefined,
    setSaid: () => undefined,
  });
  return (
    <button
      type="button"
      onClick={() => {
        remove("m1");
      }}
    >
      {deleting ?? "none"}
    </button>
  );
}

const host = document.createElement("div");
const root = createRoot(host);
const show = (connected: boolean, refused?: string) => {
  act(() => {
    root.render(<Waiting connected={connected} {...(refused === undefined ? {} : { refused })} />);
  });
  return host.textContent;
};
const press = () => {
  act(() => {
    host.querySelector("button")?.click();
  });
  return host.textContent;
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  show(false);
});

describe("useRemoval", () => {
  it("offers no second delete while one waits for Ergo, and again when its refusal comes", () => {
    show(true);
    expect(press()).toBe("m1");
    expect(show(true, "m1")).toBe("none");
  });

  // /code-review on 4d's DM bar (CR1): a link that dropped forgot the waiting delete, whose refusal then never came, so the
  // line offered no Delete again until the conversation was mounted anew.
  it("offers the line's delete again once the link drops, its answer being lost with it", () => {
    show(true);
    expect(press()).toBe("m1");
    expect(show(false)).toBe("none");
  });
});

// F2093 (AP3): the bot hides a message by a REDACT, and its author saw it vanish without a word.
describe("useRemoval: a message hidden", () => {
  const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const mine = (id: string): Line => ({ ...line(id), account: ME });
  const theirs = (id: string): Line => ({ ...line(id), account: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv" });
  const said: (string | undefined)[] = [];
  function Room({ lines, room }: { lines: readonly Line[]; room: string }) {
    const [, remove] = useRemoval({
      lines,
      refused: undefined,
      connected: true,
      onDelete: () => true,
      leave: () => undefined,
      setSaid: (flash) => said.push(flash?.title),
      me: ME,
      room,
    });
    return (
      <button
        type="button"
        onClick={() => {
          remove("a");
        }}
      />
    );
  }
  const draw = (lines: readonly Line[], room = "#bubble") => {
    act(() => {
      root.render(<Room lines={lines} room={room} />);
    });
  };
  afterEach(() => {
    said.length = 0;
  });

  it("says one's own message was hidden when it leaves the room's lines", () => {
    draw([mine("a"), theirs("b")]);
    draw([theirs("b")]);
    expect(said).toEqual(["Your message was hidden."]);
  });

  it("says nothing of another's message gone", () => {
    draw([theirs("a"), mine("b")]);
    draw([mine("b")]);
    expect(said).toEqual([]);
  });

  it("says a delete of one's own, and not a hide", () => {
    draw([mine("a"), theirs("b")]);
    act(() => {
      host.querySelector("button")?.click();
    });
    draw([theirs("b")]);
    expect(said).toEqual(["Message deleted."]);
  });

  it("says nothing of the lines of another room taking the place of the room's", () => {
    draw([mine("a"), theirs("b")], "#one");
    draw([theirs("b")], "#two");
    expect(said).toEqual([]);
  });

  it("says nothing of one's own oldest message leaving a full window as another comes in", () => {
    const full = [mine("old"), ...Array.from({ length: LINES_KEPT - 1 }, (_, each) => theirs(`t${String(each)}`))];
    draw(full);
    draw([...full.slice(1), theirs("new")]);
    expect(said).toEqual([]);
  });
});
