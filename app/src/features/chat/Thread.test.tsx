import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Thread, TITLE_LENGTH, type ThreadProps } from "./Thread.tsx";

// 4d's threads (docs/plans/chat-features.md, M3): the panel beside a room, one thread's root and its replies, drawn from
// the room's own lines, so none is fetched. The panel is a lazy chunk: the room's lines come first, as a page does.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
// A line of the room; `reply` is the msgid it answers (4d's replies).
const line = (id: string, minute: number, over: Partial<Line> & { reply?: string } = {}): Line => ({
  id,
  time: T(minute),
  from: ALICE,
  account: ALICE,
  text: id,
  kind: "message",
  ...over,
});
const ROOM_LINES = [
  line("root", 0, { text: "the root **line**" }),
  line("other", 1, { text: "another line" }),
  line("first", 2, { text: "first reply", reply: "root", account: BOB, from: BOB }),
  line("alien", 3, { text: "an answer to another", reply: "other" }),
  line("deep", 4, { text: "a reply to a reply", reply: "first" }),
];
const panel = (over: Partial<ThreadProps> = {}) =>
  renderToStaticMarkup(
    <Thread
      root="root"
      lines={ROOM_LINES}
      members={[ALICE, BOB]}
      me={ALICE}
      onClose={() => undefined}
      composer={<form aria-label="Write to this thread" />}
      {...over}
    />,
  );
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
// The inside of the list `label` names, and its items' words: the thread's own lines, a line that is a list apart.
const list = (html: string, label: string) =>
  new RegExp(`<ol[^>]*aria-label="${label}"[^>]*>(.*?)</ol>`, "s").exec(html)?.[1] ?? "";
const items = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((found) => said(found[1] ?? ""));

describe("Thread", () => {
  it("is a region named Thread, with a way to close it", () => {
    const html = panel();
    expect(html).toMatch(/<aside[^>]*aria-label="Thread"/);
    expect(html).toMatch(/<button[^>]*aria-label="Close the thread"/);
  });

  it("lists the root first, then its replies in the room's order, a reply to a reply among them", () => {
    const lines = items(list(panel(), "In this thread"));
    expect(lines).toEqual([
      expect.stringMatching(/^\d{2}:\d{2} g10gh7…3y5tv you the root line$/),
      expect.stringMatching(/^\d{2}:\d{2} g1jg8m…vsqf5 first reply$/),
      expect.stringMatching(/^\d{2}:\d{2} g10gh7…3y5tv you a reply to a reply$/),
    ]);
  });

  it("keeps the lines of another thread and the lines that answer none out", () => {
    const html = said(list(panel(), "In this thread"));
    expect(html).toContain("first reply");
    expect(html).not.toContain("another line");
    expect(html).not.toContain("an answer to another");
  });

  it("names its list apart from the room's, so a screen reader and a test tell them apart", () => {
    expect(panel()).toContain('aria-label="In this thread"');
    expect(panel()).not.toMatch(/aria-label="[^"]*[Mm]essages[^"]*"/);
  });

  it("counts the replies: none yet, one, several, the root not counted", () => {
    const only = [ROOM_LINES[0] ?? line("root", 0)];
    expect(said(panel({ lines: only }))).toContain("No replies yet");
    expect(said(panel({ lines: ROOM_LINES.slice(0, 3) }))).toMatch(/\b1 reply\b/);
    expect(said(panel())).toMatch(/\b2 replies\b/);
  });

  // The app's own word first (F808): a sender's words never stand before it; the title is text alone.
  const heading = (html: string) => [...html.matchAll(/<(h[1-6])[^>]*>(.*?)<\/\1>/gs)].map((found) => found[2] ?? "");
  const graphemes = (text: string) => [...new Intl.Segmenter().segment(text)].length;

  it("names the thread by its root's words, as plain text, after the word Thread", () => {
    const [title = ""] = heading(panel());
    expect(title).toMatch(/^Thread/);
    expect(title).toContain("the root line");
    expect(title).not.toMatch(/</);
    expect(panel()).toMatch(/<h[1-6][^>]*>Thread/);
  });

  it("cuts a long root's words in the title, an ellipsis at the cut, the whole line in its row", () => {
    const text = `${"w".repeat(TITLE_LENGTH + 40)} the end`;
    const html = panel({ lines: [line("root", 0, { text }), line("r", 1, { reply: "root" })] });
    const [title = ""] = heading(html);
    expect(graphemes(title.replace(/^Thread:? ?/, ""))).toBeLessThanOrEqual(TITLE_LENGTH);
    expect(title).toContain("…");
    expect(title).not.toContain("the end");
    expect(said(list(html, "In this thread"))).toContain("the end");
  });

  // The words of the root and of every reply are a sender's, a reply's the most open to abuse (R5): text nodes and
  // allowlisted elements, never markup they build, and a link only to https.
  const PAYLOAD = [
    "<img src=x onerror=alert(1)> <script>alert(2)</script>",
    "[a](javascript:alert(3)) [b](data:text/html,<b>x</b>) [c](//evil.example/x) [d](http://plain.example/y)",
    "[ok](https://example.com/fine) @g1notanaddressatall @g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  ].join(" ");
  const hostile = (over: "root" | "reply") =>
    panel({
      lines: [
        line("root", 0, over === "root" ? { text: PAYLOAD } : {}),
        line("r", 1, { reply: "root", ...(over === "reply" ? { text: PAYLOAD } : {}) }),
      ],
    });

  it.each(["root", "reply"] as const)(
    "shows a %s's markup, script and unsafe links as text, none as an element",
    (over) => {
      const html = hostile(over);
      expect(html).not.toMatch(/<(img|script|iframe|object|embed)\b/i);
      expect(html).not.toMatch(/<[^>]*\son(error|click|load)=/i);
      expect(html).not.toMatch(/href="(javascript|data):/i);
      expect(html).not.toMatch(/href="\/\//);
      expect(html).not.toMatch(/href="http:/);
      expect(html).toContain("&lt;img");
      // The one safe link stays a link, opened with no opener and no referrer.
      expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/fine"[^>]*rel="noopener noreferrer"/);
    },
  );

  // A mention names no one's account but a real address: another string is only words, a lookalike never shortened.
  it("shortens a mention of a member and leaves any other address whole", () => {
    const other = "g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl";
    const words = said(
      list(
        panel({
          lines: [line("root", 0), line("r", 1, { reply: "root", text: `to @${BOB} and @${other}` })],
        }),
        "In this thread",
      ),
    );
    expect(words).toContain("@g1jg8m…vsqf5");
    expect(words).toContain(`@${other}`);
  });

  it("says a reply mentions the reader, in words as the room's list does, and no other", () => {
    const lines = [
      line("root", 0),
      line("r", 1, { reply: "root", text: `ping @${ALICE}` }),
      line("q", 2, { reply: "root" }),
    ];
    const [, mentioned = "", plain = ""] = items(list(panel({ lines }), "In this thread"));
    expect(mentioned).toContain("Mentions you");
    expect(plain).not.toContain("Mentions you");
    expect(items(list(panel({ lines, me: BOB }), "In this thread")).join(" ")).not.toContain("Mentions you");
  });

  // A line's author is its account tag alone (F805, F812): a guest's line whose nick is a valid address is a guest's.
  it("shows a reply with no account tag as a guest's, though its nick is an address", () => {
    const lines = [
      line("root", 0),
      { id: "r", time: T(1), from: BOB, text: "a lookalike", kind: "message" as const, reply: "root" },
    ];
    const html = list(panel({ lines }), "In this thread");
    const [, guest = ""] = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((found) => found[1] ?? "");
    expect(said(guest)).toContain("(guest)");
    expect(guest).not.toContain("title=");
    expect(said(items(html)[0] ?? "")).not.toContain("(guest)");
  });

  // R6: the panel draws no player: the room's list does, after the moderation's verdict.
  it("draws no player or picture for a link to an accepted service, only the link", () => {
    const text = "see https://www.youtube.com/watch?v=dQw4w9WgXcQ and https://giphy.com/gifs/4548k01F5Ej28";
    const html = panel({ lines: [line("root", 0, { text }), line("r", 1, { reply: "root", text })] });
    expect(html).not.toMatch(/<(iframe|img|video|audio|dialog)\b/i);
    expect(said(html)).not.toMatch(/moderation check|Play the/i);
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
  });

  // R1: the panel reads the room's lines as the room shows them, an author's edit folded into its line.
  describe("with an edit among the room's lines", () => {
    const base = [line("a", 0, { text: "the root" }), line("b", 1, { reply: "a", text: "a reply" })];

    it("counts an edit of a reply once, as one row, its corrected words", () => {
      const lines = [...base, line("e", 2, { edits: "b", reply: "a", text: "a reply, fixed" })];
      const html = panel({ root: "a", lines });
      expect(items(list(html, "In this thread"))).toEqual([
        expect.stringMatching(/the root$/),
        expect.stringMatching(/a reply, fixed$/),
      ]);
      expect(said(html)).toMatch(/\b1 reply\b/);
      expect(said(html)).not.toMatch(/\b2 replies\b/);
      expect(said(html)).toContain("Edited");
    });

    it("titles an edited root by its corrected words", () => {
      const lines = [...base, line("e", 2, { edits: "a", text: "the root, corrected" })];
      const [title = ""] = heading(panel({ root: "a", lines }));
      expect(title).toContain("the root, corrected");
      expect(title).not.toMatch(/the root$/);
    });

    it("keeps a reply that names an edit's msgid in the thread of the line the edit corrects", () => {
      const lines = [
        ...base,
        line("e", 2, { edits: "a", text: "the root, corrected" }),
        line("c", 3, { reply: "e", text: "to the edit" }),
      ];
      const html = panel({ root: "a", lines });
      expect(
        items(list(html, "In this thread")).map((words) => words.replace(/^\S+ (Edited )?\S+ (you )?/, "")),
      ).toEqual(["the root, corrected", "a reply", "to the edit"]);
      expect(said(html)).toMatch(/\b2 replies\b/);
    });

    it("opens a thread named by an edit's msgid as the thread of the line it corrects", () => {
      const lines = [...base, line("e", 2, { edits: "a", text: "the root, corrected" })];
      expect(items(list(panel({ root: "e", lines }), "In this thread"))).toHaveLength(2);
    });
  });

  // R8: the root hidden while the panel is open: its words leave the title and the first row, the replies stay.
  it("drops a root's words once the room lost it, its replies kept under an earlier message", () => {
    const kept = panel();
    const lost = panel({ lines: ROOM_LINES.filter(({ id }) => id !== "root") });
    expect(said(kept)).toContain("the root line");
    expect(said(lost)).not.toContain("the root line");
    expect(said(lost)).toMatch(/earlier message/i);
    expect(items(list(lost, "In this thread"))).toEqual([
      expect.stringMatching(/first reply$/),
      expect.stringMatching(/a reply to a reply$/),
    ]);
  });

  it("names a root the window no longer holds an earlier message, its replies kept, and says so", () => {
    const html = panel({ root: "gone", lines: [line("r", 1, { text: "late reply", reply: "gone" })] });
    expect(said(html)).toMatch(/earlier message/i);
    expect(items(list(html, "In this thread"))).toEqual([expect.stringMatching(/ late reply$/)]);
    expect(said(html)).toMatch(/\b1 reply\b/);
  });

  it("grows with a new reply of the room, and loses a reply the room lost", () => {
    const grown = panel({ lines: [...ROOM_LINES, line("late", 9, { text: "a late one", reply: "root" })] });
    expect(items(list(grown, "In this thread"))).toHaveLength(4);
    const without = panel({ lines: ROOM_LINES.filter(({ id }) => id !== "first") });
    // The reply to the lost one answers a message that is gone: it leaves the thread (decisions, 2026-10-27).
    expect(items(list(without, "In this thread"))).toHaveLength(1);
  });

  // The root is drawn as a line, but the thread's lines carry no thread of their own: no chip, though a reply has
  // replies of its own (the journey hovers a row: no bar either, which static markup never holds).
  it("gives its own lines no thread chip, though a reply has replies of its own", () => {
    const html = list(panel(), "In this thread");
    expect(items(html)).toHaveLength(3);
    expect(said(html)).not.toMatch(/\b\d+ repl(y|ies)\b/);
  });

  it("draws nothing for the lines of a window that holds neither the root nor a reply", () => {
    const html = panel({ root: "nowhere", lines: [ROOM_LINES[1] ?? line("other", 1)] });
    expect(items(list(html, "In this thread"))).toEqual([]);
    expect(said(html)).toMatch(/No replies yet/);
  });

  // G5: a root with no words (only spaces) has no title to follow the word: no stray colon.
  it("is named Thread alone when its root's words are only spaces", () => {
    expect(heading(panel({ lines: [line("root", 0, { text: "   " })] }))).toEqual(["Thread"]);
  });

  // G2: a link of a panel's row is a Tab stop, as a link of the list's stop line is; no row is a stop of the room's list.
  it("leaves a reply's link in the Tab order and gives no row a tab stop of its own", () => {
    const text = "see [the docs](https://example.com/fine)";
    const html = panel({ lines: [line("root", 0), line("r", 1, { reply: "root", text })] });
    const tags = [...html.matchAll(/<a [^>]*href="https:\/\/example\.com\/fine"[^>]*>/g)].map(([tag]) => tag);
    expect(tags).toHaveLength(1);
    expect(tags[0]).not.toContain("tabindex");
    expect([...list(panel(), "In this thread").matchAll(/<li\b[^>]*>/g)].map(([tag]) => tag)).toHaveLength(3);
    expect(list(html, "In this thread")).not.toMatch(/<li\b[^>]*tabindex/);
  });

  // G3 (F819): an account author in view, by its account tag, makes its mention shortenable though it is not a member;
  // a guest's nick, whatever it looks like, proves nothing.
  it("shortens a mention of an account that wrote a line in view and is no member, not a guest's nick", () => {
    const carol = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";
    const lines = [
      line("root", 0, { text: `@${carol} and @${BOB}` }),
      line("a", 1, { from: carol, account: carol, reply: "root", text: "here" }),
      // The guest's nick is an address, but it has no account tag.
      { id: "g", time: T(2), from: BOB, text: "a lookalike", kind: "message" as const, reply: "root" },
    ];
    const words = said(list(panel({ members: [ALICE], lines }), "In this thread"));
    expect(words).toContain("@g1l6m6…kkanc and @g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
  });
});
