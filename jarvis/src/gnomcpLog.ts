// gnomcp's stderr into jarvis's log: its audit lines by their tool, result and time alone, never an argument, and any
// other line of its words cut and shown without hidden characters.
import { jsonOf } from "@gnoworld/core";
import { StringDecoder } from "node:string_decoder";
import type { Stream } from "node:stream";
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";
import { shown } from "./tracing.ts";
import { visible } from "./untrusted.ts";

// A stream's lines into the log, each kept to 64 KiB, so a line with no end holds no more.
export function logLines(stream: Stream | null, log: Log): void {
  const decoder = new StringDecoder();
  let kept = "";
  stream?.on("data", (chunk: Buffer) => {
    const parts = (kept + decoder.write(chunk)).split("\n");
    kept = (parts.pop() ?? "").slice(0, 64 * 1024);
    for (const line of parts) logLine(log, line);
  });
}

// An audit line, JSON, by its tool, its result and its time alone: its arguments are the model's, so a question's.
// Any other JSON line logs no word of it either; a line of gnomcp's own words, cut, its hidden characters shown.
function logLine(log: Log, line: string): void {
  if (line.trim() === "") return;
  if (!/^\s*[[{]/.test(line)) {
    // Up to its first brace: an audit line written into an unended line of words is no word of gnomcp's.
    const end = line.indexOf("{");
    log("jarvis_gnomcp_stderr", { error: visible(line.slice(0, Math.min(512, end === -1 ? 512 : end)), false) });
    return;
  }
  // What is no JSON reaches the schema as nothing, which it refuses.
  const audit = z.object({ tool: z.string(), result: z.string(), duration_ms: z.number() }).safeParse(jsonOf(line));
  // A malformed line's tool and result are no names, so shown as <malformed>, with no time.
  const {
    tool,
    result,
    duration_ms: ms,
  } = audit.success ? audit.data : { tool: "", result: "", duration_ms: undefined };
  log("jarvis_gnomcp_audit", { tool: shown(tool), reason: shown(result), ...(ms === undefined ? {} : { ms }) });
}
