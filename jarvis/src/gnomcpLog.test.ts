import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { logLines } from "./gnomcpLog.ts";
import { capture } from "./testing/kit.ts";

// gnomcp's stderr, read line by line into the log: what each kind of line comes to, and the bound on a line with no end.
const audit = (tool = "gno_eval") => JSON.stringify({ tool, result: "ok", duration_ms: 3 });
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const feed = async (...chunks: string[]) => {
  const { log, events } = capture();
  const stream = new PassThrough();
  logLines(stream, log);
  for (const chunk of chunks) {
    stream.write(chunk);
    await settle();
  }
  return events();
};

describe("gnomcp's stderr lines", () => {
  it("logs nothing for a blank line, a line of spaces or of tabs", async () => {
    expect(await feed("\n", "   \n", "\t \t\n", `${audit()}\n`)).toEqual([
      { event: "jarvis_gnomcp_audit", tool: "gno_eval", reason: "ok", ms: 3 },
    ]);
  });

  it("reads an audit line after blanks as an audit line, not as words", async () => {
    expect(await feed(` \t${audit()}\n`)).toEqual([
      { event: "jarvis_gnomcp_audit", tool: "gno_eval", reason: "ok", ms: 3 },
    ]);
  });

  it("keeps no more than 64 KiB of a line that has no end, so an audit line that long is no audit line", async () => {
    const padded = (size: number) =>
      `{"tool":"gno_eval","result":"ok","duration_ms":3,"pad":"${"p".repeat(size)}","tool":"late"`;
    expect(await feed(padded(70 * 1024), "}\n")).toEqual([
      { event: "jarvis_gnomcp_audit", tool: "<malformed>", reason: "<malformed>" },
    ]);
    expect(await feed(padded(1024), "}\n")).toEqual([
      { event: "jarvis_gnomcp_audit", tool: "late", reason: "ok", ms: 3 },
    ]);
  });
});
