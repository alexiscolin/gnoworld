// The link cards' settings (slice 13, L3; D13906): a kill switch, "1" to run, off by default, and the link reader's origin on the private network
// (http, a name, a port, no path); a card's `sexual` score hides it from 0.3 on, stricter than a line, since OpenAI scores no "sexual/minors" on an
// image (D13919). config.ts takes them in its schema and its result.
import { z } from "zod";
import type { Thresholds } from "../moderation/decide.ts";

const CARD_SEXUAL = 0.3;

export const cardSettings = () => ({
  LINK_CARDS: z.enum(["0", "1", ""]).default("0"),
  LINK_READER_URL: z
    .string()
    .regex(/^http:\/\/[a-z0-9][a-z0-9_.-]*(?::[1-9][0-9]{0,4})?$/)
    .optional(),
});

/** Turned on, the cards need the reader's address. */
export function cardsNeedReader(
  { LINK_CARDS, LINK_READER_URL }: { LINK_CARDS: string; LINK_READER_URL?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (LINK_CARDS === "1" && LINK_READER_URL === undefined)
    ctx.addIssue({ code: "custom", path: ["LINK_READER_URL"], message: "required with LINK_CARDS" });
}

export interface CardsConfig {
  enabled: boolean;
  readerUrl: string | undefined;
  thresholds: Thresholds;
}

/** The cards' settings as the server reads them: the lines' thresholds, with `sexual` at 0.3 at most. */
export const cardsConfigOf = (
  { LINK_CARDS, LINK_READER_URL }: { LINK_CARDS: string; LINK_READER_URL?: string | undefined },
  lines: Thresholds,
): CardsConfig => ({
  enabled: LINK_CARDS === "1",
  readerUrl: LINK_READER_URL,
  thresholds: { ...lines, sexual: Math.min(lines.sexual ?? 1, CARD_SEXUAL) },
});
