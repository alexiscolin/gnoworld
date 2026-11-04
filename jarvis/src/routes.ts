// jarvis's routes (D42, JARVIS_PATHS), each body through its schema first: POST /ask, a question to the loop, its result
// as the door's wire reads it (D175), the room's lines as data (D176); GET and POST /budgets, the day's two caps in
// whole dollars, changed at once and logged (D47). Off, /ask answers off before any work; /budgets serves on or off,
// so an admin sets them before switching jarvis on (D171). Since 10k, POST /translate, a line's translation, and POST
// /digest, a realm's digest, each answering off while jarvis is, once its body passed its schema.
import {
  DOOR_CAPS,
  JARVIS_PATHS,
  JarvisAsk,
  JarvisBudget,
  JarvisDigestRequest,
  JarvisTranslate,
  type JarvisAnswer,
  type JarvisBudgets,
  type JarvisDigest,
  type JarvisTranslation,
} from "@gnoworld/schemas";
import { isBlank } from "@gnoworld/core";
import type { Log } from "@gnoworld/service/log";
import type { Budget } from "./budget.ts";
import type { Digested } from "./digest.ts";
import { refusal, type Reply, type Routes } from "./http.ts";
import type { Question, Result } from "./loop.ts";
import { DOLLAR } from "./prices.ts";
import type { Translated } from "./translate.ts";

type Ask = (question: Question, signal: AbortSignal) => Promise<Result>;
interface Parts {
  // The loop's ask, the translator's and the digests', or none while jarvis is off.
  readonly ask: Ask | undefined;
  readonly translate?: ((asked: JarvisTranslate, signal: AbortSignal) => Promise<Translated>) | undefined;
  readonly digest?: ((asked: JarvisDigestRequest, signal: AbortSignal) => Promise<Digested>) | undefined;
  readonly budget: Pick<Budget, "caps" | "change">;
  readonly log: Log;
}

const answered = (answer: JarvisAnswer): Reply => ({ status: 200, body: answer });

/** The table of jarvis's routes: JARVIS_PATHS, and the methods the door calls on each. */
export function jarvisRoutes({ ask, translate, digest, budget, log }: Parts): Routes {
  const budgets = (): Reply => {
    const caps = budget.caps();
    return {
      status: 200,
      body: { ask: caps.ask / DOLLAR, translate: caps.translate / DOLLAR } satisfies JarvisBudgets,
    };
  };
  // A body its schema refuses, logged as this face's own refusals are (http.ts).
  const refused = (route: string): Reply => {
    log("jarvis_refused", { route, method: "POST", status: 400, error: "refused" });
    return refusal("refused", 400);
  };
  return {
    [JARVIS_PATHS.ask]: {
      async POST(body, signal) {
        const asked = JarvisAsk.safeParse(body);
        if (!asked.success) return refused(JARVIS_PATHS.ask);
        if (ask === undefined) return answered({ status: "off" });
        const { question, lines } = asked.data;
        return replyOf(await ask({ text: question, room: lines.map(lineOf) }, signal), log);
      },
    },
    [JARVIS_PATHS.translate]: {
      async POST(body, signal) {
        const asked = JarvisTranslate.safeParse(body);
        if (!asked.success) return refused(JARVIS_PATHS.translate);
        if (translate === undefined) return { status: 200, body: { status: "off" } satisfies JarvisTranslation };
        return translationOf(await translate(asked.data, signal));
      },
    },
    [JARVIS_PATHS.digest]: {
      async POST(body, signal) {
        const asked = JarvisDigestRequest.safeParse(body);
        if (!asked.success) return refused(JARVIS_PATHS.digest);
        if (digest === undefined) return { status: 200, body: { status: "off" } satisfies JarvisDigest };
        return digestOf(await digest(asked.data, signal));
      },
    },
    [JARVIS_PATHS.budgets]: {
      GET: () => Promise.resolve(budgets()),
      POST(body) {
        const changed = JarvisBudget.safeParse(body);
        if (!changed.success) return Promise.resolve(refused(JARVIS_PATHS.budgets));
        budget.change(changed.data.budget, changed.data.dollars * DOLLAR);
        log("jarvis_budget_changed", { setting: changed.data.budget, value: changed.data.dollars });
        return Promise.resolve(budgets());
      },
    },
  };
}

// A room's line as data: who said it (the asker, or the others by their number, D91), when, and its words, so its line
// breaks and quotes pass for no other line (D176).
const lineOf = ({ speaker, time, text }: JarvisAsk["lines"][number]): string =>
  JSON.stringify({ who: speaker === 0 ? "asker" : `#${String(speaker)}`, time, text });

function replyOf(result: Result, log: Log): Reply {
  if (result.kind === "answer") {
    const markdown = cut(result.text, log);
    // A text that draws nothing is no answer the wire can carry, nor one anybody could read.
    if (isBlank(markdown)) {
      log("jarvis_answer_empty");
      return refusal("internal", 502);
    }
    return answered({ status: "answered", markdown, buttons: result.cards.buttons.map(({ button }) => button) });
  }
  if (result.kind === "spent") return answered({ status: "spent" });
  if (result.kind === "invalid") return refusal("refused", 400);
  // Nobody reads it: the door's request is gone.
  if (result.kind === "gone") return refusal("not_ready", 503);
  return refusal("internal", 502);
}

// The answer within the wire's code points, cut on its last line break within them, or at the bound when it has none
// or when its lines before it draw nothing.
function cut(text: string, log: Log): string {
  // ponytail: every answer read whole once, its length bounded by the model's output tokens (16,000 at most, D65).
  const points = Array.from(text);
  if (points.length <= DOOR_CAPS.answer) return text;
  log("jarvis_answer_cut");
  const kept = points.slice(0, DOOR_CAPS.answer).join("");
  const lines = kept.slice(0, kept.lastIndexOf("\n") + 1);
  return isBlank(lines) ? kept : lines;
}

// A failure on the wire, as the door reads it (D175): its reader gone is not_ready, to nobody; any other internal.
const failed = (kind: "failed" | "gone"): Reply =>
  kind === "gone" ? refusal("not_ready", 503) : refusal("internal", 502);

function translationOf(result: Translated): Reply {
  if (result.kind === "failed" || result.kind === "gone") return failed(result.kind);
  const body: JarvisTranslation =
    result.kind === "translated" ? { status: "translated", text: result.text } : { status: result.kind };
  return { status: 200, body };
}

function digestOf(result: Digested): Reply {
  if (result.kind === "failed" || result.kind === "gone") return failed(result.kind);
  if (result.kind === "invalid") return refusal("refused", 400);
  const body: JarvisDigest =
    result.kind === "digest"
      ? { status: "digest", digest: result.digest, proposal: result.proposal, height: result.height }
      : { status: result.kind };
  return { status: 200, body };
}
