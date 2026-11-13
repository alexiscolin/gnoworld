// The preview job (8f, slice 7's 7l; ADR-0002 §7 "Preview captures"): every six hours it reads the home page of each realm the team's data
// lists through the default universe's RPC (vm/qrender, the way out's host already), keeps its first part, has the moderation check read
// that very part, and writes previews.json beside and renamed over. One call at a time, a pause apart, each capped in time and size. No
// check, no capture: a page the check hides is dropped, one it could not read keeps only what an earlier check passed. Nothing a chain
// wrote reaches a log: a fault is logged by its kind.
import { utf8Bytes } from "@gnoworld/core";
import {
  Capture,
  CAPTURE_MAX_BYTES,
  Previews,
  PREVIEWS_MAX,
  PREVIEWS_MAX_BYTES,
  RealmPath,
} from "@gnoworld/schemas/indexer";
import { setTimeout as sleep } from "node:timers/promises";
import { renderAsk } from "@gnoworld/chain/asks";
import type { Log } from "@gnoworld/service/log";
import { decide, type Thresholds } from "../moderation/decide.ts";
import { moderationClient, type Answer } from "../moderation/provider.ts";
import { publicUrl, reachedNothing, send as netSend } from "@gnoworld/service/net";
import { repeat, waitsAfterOutcome, type Outcome, type Repeating } from "../repeat.ts";
import { lastFile, replaceFile } from "../replaceFile.ts";
import { abciQuery, Absent, isDown, kindOf, pacer, type Kind, type Send } from "../worlds/remote.ts";

/** What the check says of a capture's text. */
export type Check = (text: string) => Promise<"pass" | "hide" | "unchecked">;

export interface PreviewsOptions {
  file: string;
  log: Log;
  universe: { readonly id: string; readonly rpc: string };
  /** The realms whose home pages are captured: the data's, each checked here again. */
  pages: readonly string[];
  check: Check;
  send?: Send;
  now?: () => number;
  /** Waits `ms` between two calls. */
  wait?: (ms: number) => Promise<void>;
  isStopped?: () => boolean;
}

export const EVERY_MS = 6 * 60 * 60_000;
export const PAUSE_MS = 250;
export const READ_MS = 10_000;
/** The most bytes of a page the chain is asked for: a page past them is no capture. */
export const PAGE_READ_MAX_BYTES = 64 * 1024;

/** A page's first CAPTURE_MAX_BYTES bytes in UTF-8, cut after the last line's end within them, else between two characters. */
export function capturedOf(page: string): string {
  let bytes = 0;
  let at = 0;
  let lineEnd = -1;
  for (const char of page) {
    bytes += utf8Bytes(char);
    if (bytes > CAPTURE_MAX_BYTES) return page.slice(0, lineEnd >= 0 ? lineEnd : at);
    at += char.length;
    if (char === "\n") lineEnd = at;
  }
  return page;
}

/** The moderation's word on a capture, by the provider's answer and the thresholds; a provider that throws or could not read is unchecked. */
export function checkOf(provider: (text: string) => Promise<Answer | "unchecked">, thresholds: Thresholds): Check {
  return async (text) => {
    let answer: Answer | "unchecked";
    try {
      answer = await provider(text);
    } catch {
      return "unchecked";
    }
    if (answer === "unchecked") return "unchecked";
    return decide(answer, thresholds).action === "pass" ? "pass" : "hide";
  };
}

/** The check main.ts builds from the server's settings: OpenAI's moderation with its key, decided by MODERATION_THRESHOLDS. */
export function checkFor(
  moderation: { readonly openaiKey: { reveal: () => string }; readonly thresholds: Thresholds },
  { log, send }: { log: Log; send?: Send },
): Check {
  const key = moderation.openaiKey.reveal();
  const provider = moderationClient(send === undefined ? { key, log } : { key, log, send });
  return checkOf(provider, moderation.thresholds);
}

// The last file's captures by their paths, or none when it is not there, is past the cap (never read whole), is no good file, or is
// another universe's.
function lastOf(file: string, universe: string): Map<string, Capture> {
  const parsed = lastFile(file, Previews, PREVIEWS_MAX_BYTES);
  return new Map(
    parsed?.universe === universe ? parsed.previews.map((capture) => [capture.path, capture] as const) : [],
  );
}

// The pages a pass reads: realm paths alone, each once, in sort()'s order, the first PREVIEWS_MAX.
const pagesOf = (pages: readonly string[]): string[] =>
  [...new Set(pages.filter((page) => RealmPath.safeParse(page).success))].toSorted().slice(0, PREVIEWS_MAX);

type Settings = PreviewsOptions & Required<Pick<PreviewsOptions, "send" | "now" | "wait" | "isStopped">>;

// The options with their defaults, so the pass reads them as plain values.
const settingsOf = (options: PreviewsOptions): Settings => ({
  ...options,
  send: options.send ?? netSend,
  now: options.now ?? Date.now,
  wait: options.wait ?? sleep,
  isStopped: options.isStopped ?? (() => false),
});

interface Pass {
  readonly options: Settings;
  readonly pace: () => Promise<void>;
  /** Whether a read of the pass reached anyone, and the kind of the last one that reached nothing. */
  reached: boolean;
  unreached?: Kind;
}

// A page's home as the chain renders it, or the kind of fault: a page that is gone (Absent) is no fault of the way, unlike a refusal. The
// pass is told whether the read reached anyone.
async function readPage(pass: Pass, path: string): Promise<string | { kind: Kind; gone: boolean }> {
  const { options } = pass;
  try {
    const page = await abciQuery({ send: options.send, rpc: options.universe.rpc }, renderAsk(path), {
      ms: READ_MS,
      maxBytes: PAGE_READ_MAX_BYTES,
    });
    pass.reached = true;
    return page;
  } catch (error) {
    const kind = kindOf(error);
    if (reachedNothing(kind)) pass.unreached = kind;
    else pass.reached = true;
    return { kind, gone: error instanceof Absent };
  }
}

// A page's capture this pass, or none. A fault of the way or a refusal of the chain keeps the earlier capture, which a check passed; a
// page gone, too large, no text or hidden by the check has none.
async function captureOf(pass: Pass, path: string, earlier: Capture | undefined): Promise<Capture | undefined> {
  const { log, now, check } = pass.options;
  await pass.pace();
  const captured = new Date(now()).toISOString();
  const read = await readPage(pass, path);
  if (typeof read !== "string") {
    log("previews_skipped", { error: read.kind });
    return !read.gone && (isDown(read.kind) || read.kind === "chain_refused") ? earlier : undefined;
  }
  const text = capturedOf(read);
  if (text.trim() === "") {
    log("previews_skipped", { error: "empty" });
    return undefined;
  }
  const verdict = await check(text);
  if (verdict === "pass") return { path, captured, text };
  log("previews_skipped", { error: verdict === "hide" ? "hidden" : "unchecked" });
  return verdict === "hide" ? undefined : earlier;
}

/** One pass. It never throws for a fault of the chain, the check or the disk: it says its kind and logs it. */
export async function runPreviews(options: PreviewsOptions): Promise<Outcome> {
  const settled = settingsOf(options);
  const { isStopped } = settled;
  const start = settled.now();
  const fail = (kind: Kind): Outcome => {
    options.log("previews_failed", { error: kind });
    return { wrote: false, kind };
  };
  try {
    const last = lastOf(options.file, options.universe.id);
    const pass: Pass = { options: settled, pace: pacer(settled.wait, PAUSE_MS, settled.now), reached: false };
    const kept: Capture[] = [];
    for (const path of pagesOf(options.pages)) {
      if (isStopped()) return fail("stopped");
      const capture = await captureOf(pass, path, last.get(path));
      if (capture !== undefined) kept.push(capture);
    }
    if (isStopped()) return fail("stopped");
    // No read reached anyone (the way out not there yet): the last file stays, and the pass runs again soon (repeat.ts's waits, F4872).
    if (!pass.reached && pass.unreached !== undefined) return fail(pass.unreached);
    const kind = written(settled, kept);
    if (kind !== undefined) return fail(kind);
    options.log("previews_written", { ms: settled.now() - start });
    return { wrote: true };
  } catch (error) {
    return fail(kindOf(error));
  }
}

// The pass's captures written whole over the last file, or the kind of fault that kept the last file.
function written(options: Pass["options"], previews: Capture[]): Kind | undefined {
  const head = { version: 1, universe: options.universe.id, updated: new Date(options.now()).toISOString() } as const;
  const file = Previews.safeParse({ ...head, previews });
  if (!file.success) return "shape";
  const text = `${JSON.stringify(file.data)}\n`;
  if (Buffer.byteLength(text, "utf8") > PREVIEWS_MAX_BYTES) return "too_large";
  return replaceFile(options.file, text) ? undefined : "write";
}

// The universe's address, or a refusal at start: https on a public name, no user, and an id the file can hold.
function checked({ id, rpc }: PreviewsOptions["universe"]): void {
  const head = { version: 1, universe: id, updated: new Date(0).toISOString(), previews: [] };
  if (!Previews.safeParse(head).success) throw new RangeError("previews: the universe id is no plain name");
  if (publicUrl(rpc) === null) throw new RangeError("previews: the rpc is no public https address");
}

/** Runs a pass at start and after each pass ends, one at a time, `everyMs` apart; `stop` ends it, and a pass under way writes nothing. */
export function startPreviews(options: PreviewsOptions & { everyMs?: number }): Repeating {
  checked(options.universe);
  const everyMs = options.everyMs ?? EVERY_MS;
  return repeat({
    pass: (isStopped) => runPreviews({ ...options, isStopped }),
    failed: () => {
      options.log("previews_failed", { error: "internal" });
    },
    waitMs: waitsAfterOutcome(everyMs),
  });
}
