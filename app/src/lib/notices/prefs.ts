// An account's notification modes, on the device (slice 4's 4f-n; ADR-0002 §1, notifications a setting of the device): for
// each room the reader chose, all, mentions or none; the default is not kept. What the device gives back is checked: rooms'
// ids and the three modes, at most MODES_KEPT, else nothing, and forgotten. A device that refuses keeps nothing and says so.
import { NOTICE_MODES, type NoticeMode } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { Address } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import type { DraftStorage } from "../drafts/drafts.ts";
import { readKept, writeKept } from "../dms/prefs.ts";

/** The rooms' modes it keeps at most. */
export const MODES_KEPT = 500;
const Modes = z
  .record(RoomId, z.enum(NOTICE_MODES))
  .check(z.refine((modes) => Object.keys(modes).length <= MODES_KEPT));

export interface NoticePrefs {
  /** The modes kept, by room; none when the device could not be read, which is then left as it is. */
  modes: () => Record<string, NoticeMode> | undefined;
  /** Keeps the modes, up to MODES_KEPT rooms; whether the device kept them. */
  setModes: (modes: Readonly<Record<string, NoticeMode>>) => boolean;
}

/** An account's notification modes on the device `storage` reaches. */
export function noticePrefs(storage: () => DraftStorage, account: Address): NoticePrefs {
  const key = `gnoworld:notices:${account}:modes`;
  return {
    modes: () =>
      readKept(storage, key, {
        empty: {},
        check: (raw) => {
          // zod's record leaves a `__proto__` key out unread: a device that holds one is not ours.
          if (typeof raw === "object" && raw !== null && Object.hasOwn(raw, "__proto__")) return undefined;
          const read = Modes.safeParse(raw);
          return read.success ? read.data : undefined;
        },
      }),
    setModes: (modes) => Object.keys(modes).length <= MODES_KEPT && writeKept(storage, key, JSON.stringify(modes)),
  };
}
