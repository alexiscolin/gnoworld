// The browser's client of the link cards (server/src/cards/routes.ts, mounted at /api/cards; link-previews L4), through the one JSON call of
// lib/api/http.ts. Every answer is read through its schema and must name what was asked; a card's picture is only ever the route of its own key.
import { CardEvent, CardRemove, LineCards, LinkCard, RoomId, VerdictId, VERDICTS_ASKED } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";
import { pageFetch } from "../query/policy.ts";

const KEY = /^[0-9a-f]{64}$/;

/** A card's picture address: the route of its key, none for any other word. The page loads no picture from anywhere else. */
export const pictureOf = (key: string): string | undefined => (KEY.test(key) ? `/api/cards/${key}/picture` : undefined);

const REFUSED = { ok: false, reason: "refused" } as const;
const MALFORMED = { ok: false, reason: "malformed" } as const;

export function cardsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The cards of these lines of a room, VERDICTS_ASKED at most: the ones that have one. */
    lines: async (room: string, ids: readonly string[]): Promise<Result<LineCards>> => {
      const sound =
        RoomId.safeParse(room).success &&
        ids.length > 0 &&
        ids.length <= VERDICTS_ASKED &&
        ids.every((id) => VerdictId.safeParse(id).success);
      if (!sound) return REFUSED;
      const query = new URLSearchParams({ room, ids: ids.join(",") });
      const result = await call({ path: `/api/cards?${query.toString()}`, schema: LineCards });
      if (!result.ok) return result;
      const asked = new Set(ids);
      const own = result.value.room === room && result.value.cards.every(({ msgid }) => asked.has(msgid));
      return own ? result : MALFORMED;
    },
    /** A card's texts and its picture's size, by its key. */
    card: async (key: string): Promise<Result<LinkCard>> =>
      KEY.test(key) ? call({ path: `/api/cards/${key}`, schema: LinkCard }) : REFUSED,
    /** Removes a line's card, by the line's id; the event the server tells, which holds no key. */
    remove: async (room: string, msgid: string): Promise<Result<CardEvent>> => {
      const body = CardRemove.safeParse({ room, msgid });
      if (!body.success) return REFUSED;
      const result = await call({ path: "/api/cards/remove", body: body.data, schema: CardEvent });
      if (!result.ok) return result;
      const { value } = result;
      return value.room === room && value.msgid === msgid && value.key === null ? result : MALFORMED;
    },
  };
}

/** The cards' client of this page, on its own fetch. */
export const pageCardsApi = () => cardsApi(pageFetch);
