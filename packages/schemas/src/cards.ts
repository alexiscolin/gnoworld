// The link cards' shapes (docs/plans/link-previews.md §7): what the link reader answers (untrusted), what the stream tells, what the
// routes answer and take. Every text is plain: no control or format character, never markup read; the card never carries a link of its
// own (the line's URL is the card's link), and a picture travels as bytes at its own route, never in a JSON the page keeps.
import { hasHidden } from "./hidden.ts";
import { PinId } from "./pins.ts";
import { RoomId } from "./rooms.ts";
import { StreamEvent, VERDICTS_ASKED } from "./stream.ts";
import { z } from "./zod.ts";

export const CARD_CAPS = {
  title: 200,
  description: 500,
  site: 100,
  pictureBytes: 16_384,
  side: 160,
  host: 253,
} as const;

const text = (max: number, min = 0) =>
  z.string().check(
    z.minLength(min),
    z.maxLength(max),
    z.refine((value) => value.isWellFormed() && !hasHidden(value), "plain text"),
  );

/** A card's key: the SHA-256 of its normalised URL, in lower-case hex. */
const CardKey = z.string().check(z.regex(/^[0-9a-f]{64}$/));

const Side = z.number().check(z.int(), z.minimum(1), z.maximum(CARD_CAPS.side));
const Size = z.strictObject({ width: Side, height: Side });

// Canonical standard base64 (no newline, no URL-safe letters), a JPEG's first three bytes (FF D8 FF is "/9j/"), at most the cap decoded.
const Jpeg = z.string().check(
  z.regex(/^\/9j\/(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  z.refine(
    (jpeg) => (jpeg.length / 4) * 3 - (jpeg.endsWith("==") ? 2 : Number(jpeg.endsWith("="))) <= CARD_CAPS.pictureBytes,
  ),
);

/** What the link reader answers for a page: the card's texts and its re-encoded picture. */
export const ReaderCard = z.strictObject({
  title: text(CARD_CAPS.title, 1),
  description: text(CARD_CAPS.description),
  site: text(CARD_CAPS.site),
  picture: z.nullable(z.strictObject({ width: Side, height: Side, jpeg: Jpeg })),
});
export type ReaderCard = z.infer<typeof ReaderCard>;

/** A line's card told on the stream: its key, or null once the card is gone (removed, redacted, replaced by an edit). */
export const CardEvent = z.strictObject({
  msgid: StreamEvent.shape.msgid,
  room: StreamEvent.shape.room,
  key: z.nullable(CardKey),
});
export type CardEvent = z.infer<typeof CardEvent>;

/** GET /api/cards's answer: the card of each line asked that has one. */
export const LineCards = z.strictObject({
  room: StreamEvent.shape.room,
  cards: z.array(z.strictObject({ msgid: StreamEvent.shape.msgid, key: CardKey })).check(z.maxLength(VERDICTS_ASKED)),
});
export type LineCards = z.infer<typeof LineCards>;

/** GET /api/cards/<key>'s answer: the texts and the picture's size. The real host is always drawn. */
export const LinkCard = z.strictObject({
  host: z.string().check(z.maxLength(CARD_CAPS.host), z.regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)),
  site: text(CARD_CAPS.site),
  title: text(CARD_CAPS.title, 1),
  description: text(CARD_CAPS.description),
  picture: z.nullable(Size),
});
export type LinkCard = z.infer<typeof LinkCard>;

/** What a page sends to remove a card: a room and a line's id, never the key. */
export const CardRemove = z.strictObject({ room: RoomId, msgid: PinId });
export type CardRemove = z.infer<typeof CardRemove>;
