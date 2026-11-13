// A line's translation as the reader reads it, and the More menu's fold of it: offered where one is drawn under the line.
import type { MenuItems } from "./menuItems.ts";
import { useJarvisHere } from "../../jarvisHere.ts";
import { foldTranslation, useTranslation } from "../../translating.ts";

/** Line `id`'s translation in `room`, in the reader's language (English where the device names none), with where Jarvis is asked from. */
export function useLineTranslation(room: string | undefined, id: string) {
  const here = useJarvisHere();
  const language = here?.language ?? "en";
  return { here, language, translated: useTranslation(here === undefined ? undefined : room, id, language) };
}

/** What menuItems takes to fold the translation of line `id` in `room` away or bring it back; none where none is drawn. */
export function useTranslationItem(room: string, id: string): MenuItems["onTranslation"] {
  const { language, translated } = useLineTranslation(room, id);
  if (translated?.state !== "done") return undefined;
  return {
    hidden: translated.hidden,
    onToggle: () => {
      foldTranslation({ room, id, language }, !translated.hidden);
    },
  };
}
