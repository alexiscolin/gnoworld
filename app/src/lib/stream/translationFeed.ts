// The page's feed of the stored translations: each `translation` event of the stream through its schema, one that fails dropped and said
// once, then into the store.
import { TranslationEvent } from "@gnoworld/schemas";
import { eventFeed } from "./eventFeed.ts";

/** The data of a `translation` event, as the stream gave it. */
export const translationFeed = eventFeed(TranslationEvent, "translation_unknown");
