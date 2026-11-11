// What the chat does with who is here (7h) and with each line the link hears (chat.ts).
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import type { Activity, makeActivity } from "./activity/activity.ts";
import type { CardFlow } from "./cards/flow.ts";
import type { listedTo } from "./chatParts.ts";
import type { makeRecentLines } from "./door/lines.ts";
import type { Said } from "./irc/link.ts";
import type { makeProgress } from "./moderation/catchup.ts";
import type { makeQueue } from "./moderation/queue.ts";
import type { pinsFor } from "./pins/wire.ts";
import { listRooms } from "./rooms/rooms.ts";
import type { Stream } from "./stream/stream.ts";
import { countriesTo, startPresent, type Present } from "./worlds/present.ts";

interface Seen {
  visible: ReturnType<typeof listedTo>;
  activity: Activity;
  stream: Stream;
  log: Log;
  now: () => number;
}

// What the chat hands on of who is here (7h, 7t3): its route, what it serves and the trends' signals; none without its file.
export const presentOf = (present: Present | undefined) =>
  present === undefined ? {} : { presence: present.routes, presenceNow: present.current, presenceChat: present.chat };

// Who is here (7h), in the rooms a guest may see: none without its file.
// What the presence reads of the stream: who has the site open (D352) and each world (D374).
// What the presence reads of the activity: the accounts' pace, and the guests' beside it (D374).
const ratesOf = ({ rates, guestRates }: Activity) => ({ rates, guestRates });

const watchersOf = ({ watching, watchingIn }: Stream) => ({ watching, inWorlds: watchingIn });

export function presentFor(db: DatabaseSync, file: string | undefined, { visible, activity, stream, log, now }: Seen) {
  if (file === undefined) return undefined;
  return startPresent({
    open: (room) => visible(room, undefined),
    ...ratesOf(activity),
    now,
    log,
    ...watchersOf(stream),
    file,
    rooms: () => listRooms(db),
  });
}

interface Heard {
  kept: ReturnType<typeof pinsFor>;
  cards: CardFlow | undefined;
  recent: ReturnType<typeof makeRecentLines>;
  activity: ReturnType<typeof makeActivity>;
  present: ReturnType<typeof presentFor>;
  visible: ReturnType<typeof listedTo>;
  progress: ReturnType<typeof makeProgress>;
  queue: ReturnType<typeof makeQueue<Said>>;
  now: () => number;
}

// What the chat does with each line the link hears: kept, counted, shown by its country, noted and queued for its check.
export function hearing({ kept, cards, recent, activity, present, visible, progress, queue, now }: Heard) {
  return (said: Said, replayed: boolean): void => {
    kept.onEdit(said);
    cards?.edited(said);
    recent.edited(said);
    // A line of a history page is no activity now, whatever its time.
    if (!replayed) activity.count(said.room, said.account, now());
    countriesTo(present, visible)(said, replayed);
    progress.heard(said);
    // A line the full queue drops is left unchecked, with the alert.
    if (!queue.push(said)) progress.settled(said);
  };
}
