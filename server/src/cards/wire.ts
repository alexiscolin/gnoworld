// The link cards as the server wires them (slice 13, L3): the flow the chat makes behind its one breaker, the lines it hears after the search index
// has, and what main hands the retention before the chat exists.
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import type { Config } from "../config.ts";
import type { Said } from "../irc/link.ts";
import type { Thresholds } from "../moderation/decide.ts";
import { withBreaker } from "../moderation/check.ts";
import type { Provider } from "../moderation/checker.ts";
import type { Typed } from "../rooms/types.ts";
import type { Stream } from "../stream/stream.ts";
import { readerClient } from "./reader.ts";
import { makeCardFlow, type CardFlow, type CardFlowOptions } from "./flow.ts";

/** The reader's call and the card thresholds, as the chat takes them. */
export interface ChatCards {
  reader: (url: string) => Promise<unknown>;
  thresholds: Thresholds;
}

interface Parts {
  db: DatabaseSync;
  roles: Typed;
  pepper: string;
  log: Log;
  now: () => number;
  stream: Stream;
  /** The chat's provider behind its breaker; none, and a card stays unchecked, never shown. */
  ask: Provider | undefined;
  cards: ChatCards | undefined;
}

/** The flow, where the cards run. */
export function cardsFlow({ cards, ask, stream, ...rest }: Parts): CardFlow | undefined {
  if (cards === undefined) return undefined;
  // A breaker of the cards' own over the same client: their failures never pause the lines' checks, and none is spent while the lines' is paused.
  const own = ask === undefined ? undefined : withBreaker(ask.raw, { now: rest.now, log: rest.log });
  const check: CardFlowOptions["check"] = (input) =>
    ask === undefined || own === undefined || ask.open() ? Promise.resolve("unchecked") : own(input);
  return makeCardFlow({ ...rest, ...cards, check, publish: stream.card });
}

/** What passes a line on to the cards once it has passed the others. */
export const thenCards =
  (passed: (said: Said) => void, cards: CardFlow | undefined) =>
  (said: Said): void => {
    passed(said);
    cards?.heard(said);
  };

/** main's part: the boot's refusals, the chat's options, and the flow's expiry for the retention, which starts before the chat. */
export function cardsBoot({ cards, moderation }: Pick<Config, "cards" | "moderation">) {
  if (cards.enabled && moderation.openaiKey === undefined) throw new Error("setting OPENAI_API_KEY_FILE: required");
  const kept: { flow?: CardFlow | undefined } = {};
  return {
    options:
      cards.enabled && cards.readerUrl !== undefined
        ? { cards: { reader: readerClient({ url: cards.readerUrl }), thresholds: cards.thresholds } }
        : {},
    expire: (limit: number): number => kept.flow?.expire(limit) ?? 0,
    attach: (flow: CardFlow | undefined): void => {
      kept.flow = flow;
    },
  };
}
