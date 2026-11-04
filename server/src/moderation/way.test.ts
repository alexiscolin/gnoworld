import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import type { Said } from "../irc/link.ts";
import { makeStream } from "../stream/stream.ts";
import { makeProgress, PROGRESS_TABLES } from "./catchup.ts";
import { VERDICT_TABLES, type Verdict } from "./check.ts";
import { moderate } from "./way.ts";

// A line's way once heard (3h to 3k), apart from the chat since 10g: what each verdict does, and when the mark moves.
const said = (): Said => ({ room: "#bubble", account: "g1a", msgid: "m1", text: "hello" });

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = (verdict: Verdict | "seen" | "busy", { sent = true }: { sent?: boolean } = {}) => {
  const db = openDatabase(":memory:", [VERDICT_TABLES, PROGRESS_TABLES]);
  opened.push(db);
  db.prepare(
    "INSERT INTO verdicts (msgid, room, account, action, at) VALUES ('m1', '#bubble', 'g1a', 'hide', 0)",
  ).run();
  const done: string[] = [];
  const progress = makeProgress(db);
  const stream = makeStream();
  const run = moderate({
    db,
    check: () => Promise.resolve(verdict),
    send: (command) => {
      done.push(command);
      return sent;
    },
    stream: {
      ...stream,
      publish: (event) => {
        done.push(`publish ${event.state}`);
      },
    },
    progress: {
      ...progress,
      settled: (line) => {
        done.push(`settled ${line.msgid}`);
      },
    },
    strike: () => done.push("strike"),
    passed: () => done.push("passed"),
  });
  const action = () => db.prepare("SELECT action FROM verdicts WHERE msgid = 'm1'").get();
  return { run, done, action };
};

describe("a line's way once heard", () => {
  it("streams a line let through, keeps it among the recent lines, and settles it", async () => {
    const { run, done } = setup({ action: "pass" });
    await run(said());
    expect(done).toEqual(["publish checked", "passed", "settled m1"]);
  });

  it("hides a line, tells its author, streams it hidden, strikes it, and settles it", async () => {
    const { run, done } = setup({ action: "hide", reason: "banned_word" });
    await run(said());
    expect(done).toEqual(["REDACT", "NOTICE", "publish hidden", "strike", "settled m1"]);
  });

  it("only settles a line it checked before", async () => {
    const { run, done } = setup("seen");
    await run(said());
    expect(done).toEqual(["settled m1"]);
  });

  it("leaves a line another run is checking to that run, which settles it", async () => {
    const { run, done } = setup("busy");
    await run(said());
    expect(done).toEqual([]);
  });

  it("neither streams nor settles a line left unchecked, whose previews wait", async () => {
    const { run, done } = setup({ action: "unchecked" });
    await run(said());
    expect(done).toEqual(["settled m1"]);
  });

  it("checks again, and does not settle, a line whose hide the link could not send", async () => {
    const { run, done, action } = setup({ action: "hide", reason: "banned_word" }, { sent: false });
    await run(said());
    expect(done).toEqual(["REDACT"]);
    expect(action()).toEqual({ action: "unchecked" });
  });
});
