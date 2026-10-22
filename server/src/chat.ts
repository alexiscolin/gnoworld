// The chat's server side as main starts it (slice 3's plan, 3h, 3i, 3j): each world's main room made, the
// IRC link in them when Ergo is set, their activity counted, and each message checked by its world's rules
// and OpenAI, through a fair queue, then acted on and streamed; the routes that tell the activity and the
// verdicts.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { makeActivity } from "./activity/activity.ts";
import { activityRoutes } from "./activity/routes.ts";
import type { Config } from "./config.ts";
import { ircLink, type Link, type Said } from "./irc/link.ts";
import type { Log } from "./log.ts";
import { act } from "./moderation/act.ts";
import { makeProgress } from "./moderation/catchup.ts";
import { checkAgain, makeChecker } from "./moderation/check.ts";
import { moderationClient, type Answer } from "./moderation/provider.ts";
import { makeQueue } from "./moderation/queue.ts";
import type { Rules } from "./roles/roles.ts";
import { ensureRooms, listRooms, roomWorld } from "./rooms/rooms.ts";
import { makeStream } from "./stream/stream.ts";

export interface Chat {
  activity: Hono;
  stream: Hono;
  stop: () => Promise<void>;
}

interface Settings {
  worlds: ReadonlyMap<string, { rules: Rules }>;
  ergo: Config["ergo"];
  moderation: Config["moderation"];
  trustedProxy?: string | undefined;
}

interface Options {
  log: Log;
  pepper: string;
  now?: () => number;
  // The provider OpenAI's client stands for, given by the tests.
  provider?: (text: string) => Promise<Answer | "unchecked">;
}

export function startChat(db: DatabaseSync, settings: Settings, options: Options): Chat {
  const { worlds, ergo, moderation } = settings;
  const { log, pepper, now = Date.now } = options;
  ensureRooms(db, [...worlds.keys()], now());
  const key = moderation.openaiKey;
  if (key === undefined && options.provider === undefined) log("alert", { error: "moderation_off" });
  const check = makeChecker({
    db,
    rulesOf: (room) => worlds.get(roomWorld(db, room) ?? "")?.rules,
    provider: options.provider ?? (key === undefined ? undefined : moderationClient({ key: key.reveal(), log })),
    thresholds: moderation.thresholds,
    pepper,
    log,
    now,
    newAccountMs: moderation.newAccountHours * 60 * 60_000,
  });
  const stream = makeStream();
  const progress = makeProgress(db);
  const send = (command: "REDACT" | "NOTICE", params: readonly string[]): boolean =>
    link?.send(command, params) ?? false;
  const queue = makeQueue<Said>({
    run: async (said) => {
      let done = true;
      try {
        const verdict = await check(said);
        if (verdict === "seen") return;
        // A hide the link could not send: checked again when the catch-up brings the line back.
        done = act(said, verdict, { send });
        if (!done) checkAgain(db, said.msgid);
        // An unchecked line has no event: its previews wait.
        else if (verdict.action !== "unchecked") {
          stream.publish({
            msgid: said.msgid,
            room: said.room,
            state: verdict.action === "hide" ? "hidden" : "checked",
          });
        }
      } finally {
        if (done) progress.settled(said);
      }
    },
    log,
    now,
  });
  const activity = makeActivity();
  const link: Link | undefined =
    ergo === undefined
      ? undefined
      : ircLink({
          ...ergo,
          rooms: () => listRooms(db).map(({ name }) => name),
          lastChecked: progress.last,
          drained: () => queue.idle(),
          onMessage: (said) => {
            activity.count(said.room, said.account, now());
            progress.heard(said);
            // A line the full queue drops is left unchecked, with the alert.
            if (!queue.push(said)) progress.settled(said);
          },
          log,
        });
  return {
    activity: activityRoutes(activity, { db, now }),
    stream: stream.routes({ proxy: settings.trustedProxy }),
    stop: async () => {
      // Nothing more starts once stopping: a line left waiting is caught up at the next start.
      queue.stop();
      await link?.stop();
      await queue.idle();
      stream.close();
    },
  };
}
