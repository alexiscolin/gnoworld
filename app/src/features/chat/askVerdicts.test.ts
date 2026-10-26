import type { Line } from "@gnoworld/core";
import type { LineVerdicts, StreamEvent } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { verdictAsker } from "./askVerdicts.ts";

// When the page began following the room's stream; a line before it is the room's history.
const OPENED = Date.parse("2026-10-26T12:00:00.000Z");
const OLD = "2026-10-26T11:00:00.000Z";
const line = (id: string, time = OLD): Line => ({
  id,
  time,
  from: "a",
  text: `${id}: https://youtu.be/dQw4w9WgXcQ`,
  kind: "message",
});
const NONE: Result<LineVerdicts> = { ok: true, value: { room: "#bubble", verdicts: [] } };

// A server that answers each request as told, keeping the ids each asked; and the verdicts handed to the store.
function server(answer: (ids: readonly string[]) => Result<LineVerdicts> = () => NONE) {
  const sent: string[][] = [];
  const heard: StreamEvent[] = [];
  const asker = verdictAsker({
    verdicts: (_room, ids) => {
      sent.push([...ids]);
      return Promise.resolve(answer(ids));
    },
    judged: (event) => {
      heard.push(event);
    },
  });
  const ask = (lines: readonly Line[], held?: Record<string, unknown>) => {
    asker.ask("#bubble", { lines, held, since: OPENED });
  };
  return { ask, sent, heard };
}

describe("verdictAsker: the server's verdicts of the lines in view", () => {
  // F884: a line from the stream's opening on has its verdict from the stream; asking the server too made every
  // reader ask for every new link at once.
  it("asks the lines older than the stream's opening alone", () => {
    const t = server();
    t.ask([line("a"), line("b", "2026-10-26T12:00:00.000Z"), line("c", "2026-10-26T12:05:00.000Z")]);
    expect(t.sent).toEqual([["a"]]);
  });

  // F884: what it asked is kept for the lines in view alone, so a long session holds no more.
  it("forgets a line that left the view, and asks it again when it comes back", () => {
    const t = server();
    t.ask([line("a"), line("b")]);
    t.ask([line("b")]);
    t.ask([line("a"), line("b")]);
    expect(t.sent).toEqual([["a", "b"], ["a"]]);
  });
});
