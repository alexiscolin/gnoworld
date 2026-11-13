import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeAll, describe, expect, it } from "vitest";
import { RoomView, type RoomViewProps } from "./RoomView.tsx";

// 4d's threads: the chip under a thread's root says how many replies the room's lines hold, and opens the thread.
// The lines view is a lazy chunk: drawn once and waited for, as RoomView.test.tsx does.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
// A line of the room; `reply` is the msgid it answers (4d's replies).
const line = (id: string, minute: number, reply?: string): Line => ({
  id,
  time: T(minute),
  from: ALICE,
  account: ALICE,
  text: id,
  kind: "message",
  ...(reply === undefined ? {} : { reply }),
});
// An edit of `edits`, or any line with fields of its own.
const edit = (id: string, minute: number, over: Partial<Line>): Line => ({ ...line(id, minute), ...over });
// A root with a reply and a reply to that reply, a line apart, and a line that answers a message gone from the window.
const LINES = [line("root", 0), line("loose", 1), line("a", 2, "root"), line("b", 3, "a"), line("orphan", 4, "gone")];
const view = (over: Partial<RoomViewProps> = {}, lines: readonly Line[] = LINES) =>
  renderToStaticMarkup(
    <RoomView
      room="#bubble/games"
      state={{ lines, members: [ALICE] }}
      chat="connected"
      me={ALICE}
      onDelete={() => false}
      onDismiss={() => undefined}
      onThread={() => undefined}
      {...over}
    />,
  );
// Each of the Messages list's own items, as its words and as its markup.
const markup = (html: string) => [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map((found) => found[0]);
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const chipOf = (item: string | undefined) =>
  /<button\b[^>]*>(?:(?!<\/button>).)*?\b\d+ repl(?:y|ies)\b.*?<\/button>/s.exec(item ?? "");

beforeAll(async () => {
  await prerender(
    <RoomView
      room="#bubble/games"
      state={{ lines: LINES, members: [ALICE] }}
      chat="connected"
      onDelete={() => false}
      onDismiss={() => undefined}
    />,
  );
});

describe("a thread's chip, under its root", () => {
  it("counts every reply of the thread, a reply to a reply included, as a button on the root's line", () => {
    const [root = ""] = markup(view());
    expect(said(chipOf(root)?.[0] ?? "")).toMatch(/^2 replies\b/);
  });

  it("says one reply in the singular", () => {
    const [root = ""] = markup(view({}, [line("root", 0), line("a", 1, "root")]));
    expect(said(chipOf(root)?.[0] ?? "")).toMatch(/^1 reply\b/);
  });

  it("puts a chip on no other line: not a reply, not a line that answers none, not an answer to a gone message", () => {
    const items = markup(view());
    expect(items).toHaveLength(5);
    expect(chipOf(items[0])).not.toBeNull();
    for (const item of items.slice(1)) expect(chipOf(item)).toBeNull();
  });

  it("gives a root with no reply none, the room reading the same lines without them", () => {
    const [root = ""] = markup(view({}, [line("root", 0), line("loose", 1)]));
    expect(root).toContain("root");
    expect(chipOf(root)).toBeNull();
  });

  it("counts the replies the room holds: a reply it lost is one fewer", () => {
    const [root = ""] = markup(view({}, [line("root", 0), line("a", 2, "root"), line("b", 3, "root")]));
    expect(said(chipOf(root)?.[0] ?? "")).toMatch(/^2 replies\b/);
    const [fewer = ""] = markup(view({}, [line("root", 0), line("b", 3, "root")]));
    expect(said(chipOf(fewer)?.[0] ?? "")).toMatch(/^1 reply\b/);
  });

  it("shows a guest the chip too: reading a thread asks no account", () => {
    const [root = ""] = markup(view({ me: undefined }));
    expect(chipOf(root)).not.toBeNull();
  });

  // R13: a direct message's lines are the view's too, built with the same props but for the room: a reply there is
  // no thread, whether or not the page passes the handler.
  it("shows no chip in a direct message, though the page passes the handler and its lines answer one another", () => {
    const html = view({ room: undefined }, [line("root", 0), line("a", 1, "root")]);
    expect(markup(html)).toHaveLength(2);
    expect(html).not.toMatch(/\b\d+ repl(?:y|ies)\b/);
  });

  it("shows no chip in a room whose view opens no thread", () => {
    const html = view({ onThread: undefined });
    expect(markup(html)).toHaveLength(5);
    expect(html).not.toMatch(/\b\d+ repl(?:y|ies)\b/);
  });

  // R1: the room's lines as it shows them (4d's edits): an edit is no reply, and a reply that names an edit's msgid
  // answers the line the edit corrects.
  it("counts an author's edit of a reply once: the edit is no second reply", () => {
    const lines = [
      line("root", 0),
      line("a", 1, "root"),
      edit("e", 2, { reply: "root", edits: "a", text: "a, fixed" }),
    ];
    const [root = ""] = markup(view({}, lines));
    expect(said(chipOf(root)?.[0] ?? "")).toMatch(/^1 reply\b/);
  });

  it("counts a reply that names an edit's msgid on the root the edit's line is in", () => {
    const lines = [line("root", 0), edit("e", 1, { edits: "root", text: "root, fixed" }), line("a", 2, "e")];
    const [root = ""] = markup(view({}, lines));
    expect(root).toContain("root, fixed");
    expect(said(chipOf(root)?.[0] ?? "")).toMatch(/^1 reply\b/);
  });

  // The list is one tab stop, a line (docs/decisions.md, 2026-10-26): a chip joins the roving, the Thread action of the
  // line's bar being the way to every thread by keyboard.
  it("keeps the chip out of the Tab order of every line but the list's one stop", () => {
    const [root = ""] = markup(view());
    expect(chipOf(root)?.[0]).toMatch(/tabindex="-1"/);
  });

  it("names what the chip does for a screen reader, not the count alone", () => {
    const [root = ""] = markup(view());
    expect(chipOf(root)?.[0]).toMatch(/aria-label="2 replies, open the thread"/);
  });
});
