import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { Presence } from "@gnoworld/schemas/indexer";
import { makeActivity } from "./activity/activity.ts";
import { presentFor } from "./chatHearing.ts";
import { EARTH_TABLES, ROOM_STATE } from "./rooms/create.ts";
import { ensureNamed, ensureRooms, ROOM_TABLES } from "./rooms/rooms.ts";
import { makeStream } from "./stream/stream.ts";

const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-11-16T12:00:00.000Z");
const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

// F13686: the presence reads the bounded set of rooms, never an archived Earth room past the window.
it("counts who is here in the rooms the lists hold, none in an archived Earth room made more than 30 days ago", async () => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, EARTH_TABLES]);
  ensureRooms(db, ["earth"], T0);
  ensureNamed(db, [{ name: "#earth/old", world: "earth" }], T0 - 31 * DAY);
  db.prepare("UPDATE rooms SET archived = 1 WHERE name = '#earth/old'").run();
  const file = join(mkdtempSync(join(tmpdir(), "gnoworld-hearing-")), "presence.json");
  const present = presentFor(db, file, {
    visible: () => true,
    activity: makeActivity(),
    stream: makeStream(),
    log: () => undefined,
    now: () => T0,
  });
  if (present === undefined) throw new Error("no presence");
  stops.push(() => {
    present.stop();
    db.close();
  });
  present.seen("#earth", ["gnoworld", "ada"]);
  present.seen("#earth/old", ["gnoworld", "bo", "cy"]);
  const body = Presence.parse(await (await present.routes.request("/")).json());
  expect(body.worlds.find(({ world }) => world === "earth")?.here).toBe(1);
});
