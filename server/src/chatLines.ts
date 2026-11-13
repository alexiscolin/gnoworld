// What becomes of each line moderation lets through: the recent lines, the search index, the first signals, the link
// cards and the stored translations, in the order chat.ts hears them.
import type { DatabaseSync } from "node:sqlite";
import { recentFor } from "./door/saidWire.ts";
import { cardsFlow, thenCards } from "./cards/wire.ts";
import { indexing } from "./search/wire.ts";
import { passedLines } from "./signals/signals.ts";
import { thenTranslations, translationsFlow } from "./translations/wire.ts";
import type { Options, Settings } from "./chat.ts";
import type { Link } from "./irc/link.ts";
import type { Stream } from "./stream/stream.ts";
import type { Provider } from "./moderation/checker.ts";

interface Parts extends Options {
  now: () => number;
  stream: Stream;
  /** The chat's provider behind its breaker. */
  ask: Provider | undefined;
  link: () => Link | undefined;
}

/** The recent lines and the index, the link cards and the translations, and what runs once a line has passed. */
export function linesAfter(db: DatabaseSync, settings: Settings, options: Parts) {
  const { log, now, pepper, stream, ask, link } = options;
  const { recent, answers } = recentFor(db, settings, { door: options.door, log, now, ask, link });
  // Every line the bot passed, the guests' relayed ones too, goes to the recent lines and to the index (F13700).
  const index = indexing(options.search, log, { recent, link });
  const passed = passedLines({ roles: settings, recent: index.recent, stream, signals: options.signals });
  // The link cards, once a line has passed: their flow checks the card behind the chat's one breaker.
  const cards = cardsFlow({ db, roles: settings, pepper, log, now, stream, ask, cards: options.cards });
  const translations = translationsFlow({ db, roles: settings, log, now, stream, translate: options.translate });
  const afterPassed = thenTranslations(thenCards(passed, cards), translations);
  return { recent, answers, index, cards, translations, afterPassed };
}
