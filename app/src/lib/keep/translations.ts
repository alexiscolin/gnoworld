// The lines' translations on the device: a line's translation, or that it was already in the reader's language, by room, line and language,
// so a reload asks nothing. What the device gives back is checked: an entry that is none is dropped; a device that refuses keeps nothing.
import { JARVIS_LANGUAGES, TRANSLATION_CAPS } from "@gnoworld/schemas";
import { jsonOf } from "@gnoworld/core";
import type { DraftStorage } from "../drafts/drafts.ts";
import { z } from "../jitless.ts";
import { isRecord } from "./device.ts";

/** The translations kept at most, the oldest leaving first. */
export const TRANSLATIONS_KEPT = 500;
const KEY = "gnoworld:translations";

const Kept = z.union([
  z.strictObject({
    text: z.string().check(z.minLength(1), z.maxLength(TRANSLATION_CAPS.text)),
    from: z.optional(z.enum(JARVIS_LANGUAGES)),
  }),
  z.strictObject({ original: z.literal(true) }),
]);
type Kept = z.infer<typeof Kept>;

/** The translations kept on the device `storage` reaches. */
function translationsKept(storage: () => DraftStorage) {
  const get = (): Record<string, Kept> => {
    try {
      const held = storage().getItem(KEY);
      if (held === null) return {};
      const raw = jsonOf(held);
      if (!isRecord(raw)) {
        storage().removeItem(KEY);
        return {};
      }
      const good: [string, Kept][] = [];
      for (const [key, value] of Object.entries(raw)) {
        const read = Kept.safeParse(value);
        if (read.success) good.push([key, read.data]);
      }
      return Object.fromEntries(good.slice(-TRANSLATIONS_KEPT));
    } catch {
      return {};
    }
  };
  return {
    get,
    /** Keeps one more; whether the device kept it. */
    add: (key: string, kept: Kept): boolean => {
      try {
        const others = Object.entries(get()).filter(([held]) => held !== key);
        storage().setItem(KEY, JSON.stringify(Object.fromEntries([...others, [key, kept]].slice(-TRANSLATIONS_KEPT))));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The page's translations. */
export const pageTranslations = (storage: () => DraftStorage = () => localStorage) => translationsKept(storage);
