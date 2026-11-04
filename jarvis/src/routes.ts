// jarvis's routes (D42, JARVIS_PATHS), each body through its schema first: POST /ask, a question to the loop, its result
// as the door's wire reads it (D175), the room's lines as data (D176); GET and POST /budgets, the day's two caps in
// whole dollars, changed at once and logged (D47). Off, /ask answers off before any work; /budgets serves on or off,
// so an admin sets them before switching jarvis on (D171). 10k adds its routes to this table.
import {
  DOOR_CAPS,
  JARVIS_PATHS,
  JarvisAsk,
  JarvisBudget,
  type JarvisAnswer,
  type JarvisBudgets,
} from "@gnoworld/schemas";
import { isBlank } from "@gnoworld/core";
import type { Log } from "@gnoworld/service/log";
import type { Budget } from "./budget.ts";
import { refusal, type Reply, type Routes } from "./http.ts";
import type { Question, Result } from "./loop.ts";
import { DOLLAR } from "./prices.ts";

type Ask = (question: Question, signal: AbortSignal) => Promise<Result>;
interface Parts {
  // The loop's ask, or none while jarvis is off.
  readonly ask: Ask | undefined;
  readonly budget: Pick<Budget, "caps" | "change">;
  readonly log: Log;
}

const answered = (answer: JarvisAnswer): Reply => ({ status: 200, body: answer });

/** The table of jarvis's routes: JARVIS_PATHS, and the methods the door calls on each. */
export function jarvisRoutes({ ask, budget, log }: Parts): Routes {
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
  // More code points than the bound needs more code units: a short text is kept as it is, unread.
  if (text.length <= DOOR_CAPS.answer) return text;
  const points = Array.from(text);
  if (points.length <= DOOR_CAPS.answer) return text;
  log("jarvis_answer_cut");
  const kept = points.slice(0, DOOR_CAPS.answer).join("");
  const lines = kept.slice(0, kept.lastIndexOf("\n") + 1);
  return isBlank(lines) ? kept : lines;
}
