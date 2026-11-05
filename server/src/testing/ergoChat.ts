// The chat as main starts it, over a real Ergo (3j to 3m): its tables, its rules, a provider that flags
// "hurt", and chatFor, which waits until the bot is in its rooms.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { startChat } from "../chat.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { LOGIN_TABLES } from "../login/login.ts";
import { TICKET_TABLES } from "../login/ticket.ts";
import { PROGRESS_TABLES } from "../moderation/catchup.ts";
import { VERDICT_TABLES } from "../moderation/check.ts";
import { MUTE_TABLES } from "../moderation/mute.ts";
import type { Answer } from "../moderation/provider.ts";
import { PIN_TABLES } from "../pins/pins.ts";
import { ROOM_STATE } from "../rooms/create.ts";
import { ROOM_TABLES } from "../rooms/rooms.ts";
import { answer } from "./answers.ts";
import type { Ergo } from "./ergo.ts";
import { oper, stops } from "./ergoKit.ts";

export const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
// A provider that flags violence in any text saying "hurt", and records what it was asked.
const provider =
  (asked: string[]) =>
  (text: string): Promise<Answer> => {
    asked.push(text);
    const hurt = text.includes("hurt");
    return Promise.resolve(answer({ violence: hurt }, { violence: hurt ? 0.99 : 0 }));
  };
// A watcher a chat: its nick of its own.
let watchers = 0;
export const TABLES = [
  LOGIN_TABLES,
  TICKET_TABLES,
  ROOM_TABLES,
  VERDICT_TABLES,
  PROGRESS_TABLES,
  MUTE_TABLES,
  ROOM_STATE,
  PIN_TABLES,
];
const MUTE = { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 };
interface More {
  db?: DatabaseSync;
  now?: () => number;
  tickMs?: number;
  lines?: string[];
  worlds?: Parameters<typeof startChat>[1]["worlds"];
  reconcileMs?: number;
  team?: ReadonlySet<string>;
  // The account of a session's token, for the routes that ask who reads (4d's pins).
  session?: (token: string | undefined) => string | undefined;
  // What answers each line's check, in place of the one that flags "hurt": a test holds a check back with it.
  provider?: (text: string) => Promise<Answer>;
}
// The options a test gave, the others left to the chat's own.
const given = ({ now, session, tickMs, reconcileMs }: More) => ({
  ...(now === undefined ? {} : { now }),
  ...(session === undefined ? {} : { session }),
  ...(tickMs === undefined ? {} : { tickMs }),
  ...(reconcileMs === undefined ? {} : { reconcileMs }),
});
// The chat as main starts it, on its own database or one a restart shares.
export const chatFor = async (e: Ergo, asked: string[], more: More = {}) => {
  const db = more.db ?? openDatabase(":memory:", TABLES);
  const chat = startChat(
    db,
    {
      worlds: more.worlds ?? new Map([["bubble", { rules: RULES }]]),
      ergo: { host: "127.0.0.1", port: e.port, password: e.operPassword },
      moderation: { openaiKey: undefined, thresholds: {}, newAccountHours: 24, mute: MUTE },
      team: more.team,
    },
    {
      log: logger("a-pepper-of-forty-characters-0123456789", (line) => more.lines?.push(line) ?? 0),
      pepper: "a-pepper-of-forty-characters-0123456789",
      provider: more.provider ?? provider(asked),
      ...given(more),
    },
  );
  stops.push(async () => {
    await chat.stop();
    if (more.db === undefined) db.close();
  });
  // A nick of its own each time: a restart's chat watches beside the last one's.
  watchers += 1;
  const watcher = await oper(e, `watcher${String(watchers)}`);
  for (;;) {
    watcher.send("NAMES #bubble");
    const names = await watcher.expect(/ (353|366) \S+ (= )?#bubble /);
    if (names.includes(" 353 ") && names.includes("gnoworld")) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const ids = z.array(z.object({ msgid: z.string() }));
  const verdicts = () =>
    ids.parse(db.prepare("SELECT msgid FROM verdicts ORDER BY msgid").all()).map(({ msgid }) => msgid);
  return { db, verdicts, stop: chat.stop, chat };
};
