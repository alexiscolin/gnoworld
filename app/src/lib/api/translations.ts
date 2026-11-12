// The browser's client of the stored translations (server/src/translations/routes.ts, mounted at /api/translations), through the one JSON
// call of lib/api/http.ts: at most 30 lines an ask, the answer read through its schema and naming the room, the language and the lines
// asked alone. The page never sends a line's text: the server has its own.
import { JARVIS_LANGUAGES, LineTranslations, RoomId, TRANSLATIONS_ASKED, VerdictId } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

// Whether a request is one the server could answer: a room, 1 to 30 lines by their ids, a language of the list.
const sound = (room: string, ids: readonly string[], language: string): boolean =>
  RoomId.safeParse(room).success &&
  ids.length > 0 &&
  ids.length <= TRANSLATIONS_ASKED &&
  ids.every((id) => VerdictId.safeParse(id).success) &&
  JARVIS_LANGUAGES.some((known) => known === language);

// Whether an answer names what was asked alone.
const named = ({ room, language, translations, pending }: LineTranslations, asked: Asked): boolean =>
  room === asked.room &&
  language === asked.language &&
  translations.every(({ msgid }) => asked.ids.has(msgid)) &&
  pending.every((msgid) => asked.ids.has(msgid));

interface Asked {
  room: string;
  language: string;
  ids: ReadonlySet<string>;
}

export function translationsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The stored translations of these lines of a room in a language, the ones still being made named apart. */
    lines: async (room: string, ids: readonly string[], language: string): Promise<Result<LineTranslations>> => {
      if (!sound(room, ids, language)) return { ok: false, reason: "refused" };
      const query = new URLSearchParams({ room, ids: ids.join(","), language });
      const result = await call({ path: `/api/translations?${query.toString()}`, schema: LineTranslations });
      if (!result.ok) return result;
      return named(result.value, { room, language, ids: new Set(ids) }) ? result : { ok: false, reason: "malformed" };
    },
  };
}

/** The translations' client of this page, on its own fetch. */
export const pageTranslationsApi = () => translationsApi((url, init) => fetch(url, init));
