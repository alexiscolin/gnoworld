// The server's migrations, in the order they ran on every database: a file is at `user_version` N once its
// first N have run, so an entry is never edited, moved or inserted, only appended (db.ts). migrations.test.ts
// holds each one's SHA-256 and fails on any of those.
import { QUOTA_TABLES } from "./door/quota.ts";
import { GUEST_TABLES } from "./guest/guests.ts";
import { LOGIN_TABLES, NONCE_ACTION, NONCE_HOST } from "./login/login.ts";
import { TICKET_TABLES } from "./login/ticket.ts";
import { PROGRESS_TABLES } from "./moderation/catchup.ts";
import { VERDICT_TABLES } from "./moderation/check.ts";
import { MUTE_TABLES } from "./moderation/mute.ts";
import { STRIKE_TABLES } from "./moderation/strikes.ts";
import { PIN_TABLES } from "./pins/pins.ts";
import { EARTH_TABLES, REALM_TABLES, ROOM_STATE } from "./rooms/create.ts";
import { ROOM_SAID } from "./rooms/earth.ts";
import { ROOM_TABLES } from "./rooms/rooms.ts";
import { SIGNAL_TABLES } from "./signals/signals.ts";

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
  QUOTA_TABLES,
  SIGNAL_TABLES,
  REALM_TABLES,
  EARTH_TABLES,
  GUEST_TABLES,
  ROOM_SAID,
];
