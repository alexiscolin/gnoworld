// A line's stored translation as the server tells it (the stream's `translation` event) and answers it (GET /api/translations): the line by
// its room and id as the stream's, never its text; a translated text within jarvis's own cap, or the original kept as such.
import { JARVIS_LANGUAGES, JarvisTranslation } from "./jarvis.ts";
import { StreamEvent } from "./stream.ts";
import { z } from "./zod.ts";

/** The lines one request asks at most. */
export const TRANSLATIONS_ASKED = 30;
/** How long an ask waits for the lines it started: under the page's call time limit (10 s), so a slow batch answers with the rest pending. */
export const TRANSLATIONS_WAIT_MS = 8000;

const [Translated] = JarvisTranslation.def.options;
const Language = z.enum(JARVIS_LANGUAGES);
const { msgid } = StreamEvent.shape;
const translated = { status: z.literal("translated"), text: Translated.shape.text, from: Translated.shape.from };
const original = { status: z.literal("original") };

/** A line's translation into a language, told on the stream as it is stored, or `gone` when its words were edited or hidden. */
export const TranslationEvent = z.discriminatedUnion("status", [
  z.strictObject({ room: StreamEvent.shape.room, msgid, language: Language, ...translated }),
  z.strictObject({ room: StreamEvent.shape.room, msgid, language: Language, ...original }),
  z.strictObject({ room: StreamEvent.shape.room, msgid, language: Language, status: z.literal("gone") }),
]);
export type TranslationEvent = z.infer<typeof TranslationEvent>;

/** GET /api/translations's answer: the stored translations of the lines asked, those still being made, and why making stopped. */
export const LineTranslations = z.strictObject({
  room: StreamEvent.shape.room,
  language: Language,
  translations: z
    .array(
      z.discriminatedUnion("status", [
        z.strictObject({ msgid, ...translated }),
        z.strictObject({ msgid, ...original }),
      ]),
    )
    .check(z.maxLength(TRANSLATIONS_ASKED)),
  pending: z.array(msgid).check(z.maxLength(TRANSLATIONS_ASKED)),
  /** Lines left unmade for now (an account's or the minute's limit): to ask again later. */
  later: z.optional(z.array(msgid).check(z.maxLength(TRANSLATIONS_ASKED))),
  halt: z.optional(z.enum(["spent", "off"])),
});
export type LineTranslations = z.infer<typeof LineTranslations>;
