// The server's migrations, in the order they ran on every database: a file is at `user_version` N once its
// first N have run, so an entry is never edited, moved or inserted, only appended (db.ts). migrations.test.ts
// holds each one's SHA-256 and fails on any of those.
import { LOGIN_TABLES, NONCE_ACTION, NONCE_HOST } from "./login/login.ts";
import { TICKET_TABLES } from "./login/ticket.ts";
import { PROGRESS_TABLES } from "./moderation/catchup.ts";
import { VERDICT_TABLES } from "./moderation/check.ts";
import { MUTE_TABLES } from "./moderation/mute.ts";
import { STRIKE_TABLES } from "./moderation/strikes.ts";
import { PIN_TABLES } from "./pins/pins.ts";
import { ROOM_STATE } from "./rooms/create.ts";
import { ROOM_TABLES } from "./rooms/rooms.ts";

export const migrations: readonly string[] = [
  LOGIN_TABLES,
  TICKET_TABLES,
  NONCE_HOST,
  ROOM_TABLES,
  VERDICT_TABLES,
  PROGRESS_TABLES,
  MUTE_TABLES,
  STRIKE_TABLES,
  ROOM_STATE,
  PIN_TABLES,
  NONCE_ACTION,
];
