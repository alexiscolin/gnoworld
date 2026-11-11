// What the flow asks of the link reader and of OpenAI for one page (slice 13, L3): the reader's answer held to its schema and to the picture's
// real size, the check of the card's words and picture, and what its answer means.
import { ReaderCard } from "@gnoworld/schemas";
import type { Thresholds } from "../moderation/decide.ts";
import { CATEGORIES, type Answer, type ModerationInput } from "../moderation/provider.ts";
import { jpegSize } from "./jpeg.ts";
import type { Page, State } from "./store.ts";

const READER_MS = 10_000;

const within = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });

/** The reader's answer, held to the schema and to the picture's real size; "down" when it fails or takes too long, "shape" for an answer no schema takes. */
export async function readCard(
  reader: (url: string) => Promise<unknown>,
  url: string,
): Promise<ReaderCard | "down" | "shape"> {
  let raw: unknown;
  try {
    raw = await within(reader(url), READER_MS);
  } catch {
    return "down";
  }
  const parsed = ReaderCard.safeParse(raw);
  if (!parsed.success) return "shape";
  const { picture } = parsed.data;
  const size = picture === null ? undefined : jpegSize(Buffer.from(picture.jpeg, "base64"));
  return picture === null || (size?.width === picture.width && size.height === picture.height) ? parsed.data : "shape";
}

/** The reader's answer for a stored page, as the reader gave it. */
export const answerOf = ({ title, description, site, picture, width, height }: Page): ReaderCard | undefined =>
  title === null
    ? undefined
    : {
        title,
        description: description ?? "",
        site: site ?? "",
        picture:
          picture === null || width === null || height === null
            ? null
            : { width, height, jpeg: Buffer.from(picture).toString("base64") },
      };

type Check = (input: ModerationInput) => Promise<Answer | "unchecked">;

/** What a card's check says: its words and picture in one call; a check that rejects is one that could not answer. */
export async function checkCard(
  check: Check,
  { title, description, site, picture }: ReaderCard,
): Promise<Answer | "unchecked"> {
  const input = {
    text: [title, description, site].filter((part) => part !== "").join("\n"),
    ...(picture === null ? {} : { image: `data:image/jpeg;base64,${picture.jpeg}` }),
  };
  try {
    return await check(input);
  } catch {
    return "unchecked";
  }
}

/** The state a page takes from the check's answer: refused when OpenAI flags a category or a score reaches the card's threshold. */
export function stateAfter(answer: Answer | "unchecked", thresholds: Thresholds): State {
  if (answer === "unchecked") return "unchecked";
  const over = CATEGORIES.some(
    (category) => answer.flagged[category] || answer.scores[category] >= (thresholds[category] ?? Infinity),
  );
  return over ? "failed" : "passed";
}
