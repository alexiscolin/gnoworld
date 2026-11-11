// OpenAI's moderation, the check's provider (ADR-0002 §6; slice 3's plan, 3i): the text alone goes out,
// with the model's name and nothing that names its author. Every answer goes through Zod against the 13
// categories OpenAI's API description lists: any other shape counts as not checked, and raises the alert.
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";
import { send as netSend } from "@gnoworld/service/net";

export const CATEGORIES = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/instructions",
  "self-harm/intent",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Answer {
  flagged: Record<Category, boolean>;
  scores: Record<Category, number>;
}

/** What goes to OpenAI: a message's text, or a link card's text with its picture as a data URL (text and image_url parts). */
export type ModerationInput = string | { text: string; image?: string };

interface Options {
  key: string;
  log: Log;
  send?: typeof netSend;
}

const partsOf = (input: ModerationInput) =>
  typeof input === "string"
    ? input
    : [
        { type: "text", text: input.text },
        ...(input.image === undefined ? [] : [{ type: "image_url", image_url: { url: input.image } }]),
      ];

export function moderationClient({
  key,
  log,
  send = netSend,
}: Options): (input: ModerationInput) => Promise<Answer | "unchecked"> {
  const byCategory = <T extends z.ZodType>(value: (category: Category) => T) =>
    z.strictObject(
      Object.fromEntries(CATEGORIES.map((category) => [category, value(category)])) as Record<Category, T>,
    );
  // The description lets illicit's two flags be null: read as not flagged.
  const nullable = new Set<Category>(["illicit", "illicit/violent"]);
  const Flag = (category: Category) =>
    nullable.has(category)
      ? z
          .boolean()
          .nullable()
          .transform((flag) => flag === true)
      : z.boolean();
  const Result = z.object({
    categories: byCategory(Flag),
    category_scores: byCategory(() => z.number().min(0).max(1)),
  });
  const Body = z.object({ results: z.tuple([Result]) });
  return async (text) => {
    let response: Response;
    try {
      response = await send(
        "https://api.openai.com/v1/moderations",
        {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "omni-moderation-latest", input: partsOf(text) }),
        },
        5000,
      );
    } catch {
      log("moderation_unchecked", { error: "down" });
      return "unchecked";
    }
    if (!response.ok) {
      // Busy or down passes; anything else (a key refused, a request it reads as bad) needs a person.
      // The log tells OpenAI's limit (429) from an outage: the first asks for fewer requests or a higher tier.
      if (response.status === 429) log("moderation_unchecked", { error: "rate_limited" });
      else if (response.status >= 500) log("moderation_unchecked", { error: "down" });
      else log("alert", { error: "moderation_refused" });
      return "unchecked";
    }
    let json: unknown;
    try {
      json = JSON.parse(await response.text());
    } catch {
      json = undefined;
    }
    const body = Body.safeParse(json);
    if (!body.success) {
      log("alert", { error: "moderation_shape" });
      return "unchecked";
    }
    const [{ categories, category_scores: scores }] = body.data.results;
    return { flagged: categories, scores };
  };
}
