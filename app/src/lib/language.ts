// The languages a line is translated into (JARVIS_LANGUAGES), and their names.
import type { JARVIS_LANGUAGES } from "@gnoworld/schemas";

export type Language = (typeof JARVIS_LANGUAGES)[number];

/** A language's name in `inLanguage`: its own by default ("français"), as the reader's list shows it. */
export const languageName = (code: Language, inLanguage: Language = code): string =>
  new Intl.DisplayNames([inLanguage], { type: "language" }).of(code) ?? code;
