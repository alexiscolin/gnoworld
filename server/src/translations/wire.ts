// The stored translations as the server wires them: the flow the chat makes once a line has passed, the lines it hears after the others,
// and what main hands the retention before the chat exists.
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import type { Hono } from "hono";
import type { Said } from "../irc/link.ts";
import type { Typed } from "../rooms/types.ts";
import type { Stream } from "../stream/stream.ts";
import type { Chat } from "../chat.ts";
import type { Config } from "../config.ts";
import { translationRoutes, type TranslationRoutesOptions } from "./routes.ts";
import { makeTranslationFlow, type Translate, type TranslationFlow } from "./flow.ts";

interface Parts {
  db: DatabaseSync;
  roles: Typed;
  log: Log;
  now: () => number;
  stream: Pick<Stream, "translation" | "languages">;
  /** jarvis's translate call; none while Jarvis is off. */
  translate: Translate | undefined;
}

/** The flow, where Jarvis is on. */
export const translationsFlow = ({ stream, ...rest }: Parts): TranslationFlow | undefined =>
  rest.translate === undefined
    ? undefined
    : makeTranslationFlow({ ...rest, publish: stream.translation, languages: stream.languages });

/** What passes a line on to the translations once it has passed the others. */
export const thenTranslations =
  (passed: (said: Said) => void, translations: Pick<TranslationFlow, "heard"> | undefined) =>
  (said: Said): void => {
    passed(said);
    translations?.heard(said);
  };

type Attach = Pick<TranslationRoutesOptions, "session" | "log"> & { config: Pick<Config, "trustedProxy" | "origins"> };

/** main's part: the flow's expiry for the retention, which starts before the chat, and the route once the chat exists. */
export function translationsBoot() {
  const kept: { flow?: TranslationFlow | undefined } = {};
  return {
    expire: (limit: number): number => kept.flow?.expire(limit) ?? 0,
    /** The flow set, and `/api/translations` mounted: none while Jarvis is off, but never a 404 to a page that asks. */
    attach(chat: Pick<Chat, "translations" | "mayRead">, app: Hono, { session, config, log }: Attach): void {
      const flow = chat.translations;
      kept.flow = flow;
      const off: Pick<TranslationFlow, "asked"> = {
        asked: ({ room, language }) => Promise.resolve({ room, language, translations: [], pending: [] }),
      };
      app.route(
        "/api/translations",
        translationRoutes({
          flow: flow ?? off,
          readable: chat.mayRead,
          session,
          proxy: config.trustedProxy,
          origins: config.origins,
          log,
          now: Date.now,
        }),
      );
    },
  };
}
