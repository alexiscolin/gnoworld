// The More menu's fold of a line's translation: offered where one is drawn under the line.
import type { MenuItems } from "./menuItems.ts";
import { useJarvisHere } from "../../jarvisHere.ts";
import { foldTranslation, useTranslation } from "../../translating.ts";

/** What menuItems takes to fold the translation of line `id` in `room` away or bring it back; none where none is drawn. */
export function useTranslationItem(room: string, id: string): MenuItems["onTranslation"] {
  const here = useJarvisHere();
  const language = here?.language ?? "en";
  const translated = useTranslation(here === undefined ? undefined : room, id, language);
  if (translated?.state !== "done") return undefined;
  return {
    hidden: translated.hidden,
    onToggle: () => {
      foldTranslation({ room, id, language }, !translated.hidden);
    },
  };
}
