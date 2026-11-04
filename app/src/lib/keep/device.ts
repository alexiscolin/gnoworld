// What this device keeps for whoever uses it, guest or account (slice 8; ADR-0002 §1, "Device"): the settings, the passport's stamps and
// the worlds charted here, the streak, today's expedition, the quests, the worlds and people followed, the reminders and the notifications read. Nothing of it leaves the
// device. Each field is one key, read through its schema: an entry that is none is dropped and kept aside (a newer page's, written back),
// another shape forgets the key, and a device that refuses (blocked, full) is read as unreadable, which the store then never writes over.
import { Address, Day, Time } from "@gnoworld/schemas";
import type { DraftStorage } from "../drafts/drafts.ts";
import { z } from "../jitless.ts";
import {
  DEFAULT_SETTINGS,
  DEVICE_EMPTY,
  type Device,
  type DeviceField,
  type DeviceFields,
  type Settings,
} from "./fields.ts";

/** The stamps, the worlds charted and the quests kept at most: a person with 5,000 stamps costs what one costs. */
const STAMPS_KEPT = 10_000;
/** The worlds followed, the people followed, the reminders and the notifications marked read kept at most, each. */
const FOLLOWS_KEPT = 500;

// A place as the device names it: its universe and its world's id ("gnoland:memba"), or an event's or a quest's id.
const Key = z.string().check(z.minLength(1), z.maxLength(256), z.regex(/^[^\s\0-\x1f\x7f]+$/));
const Count = z.int().check(z.minimum(0), z.maximum(100_000));

const Quality = z.enum(["auto", "high", "low"]);
/** The settings (ADR-0002 §1, Menu and settings): each has its default when the device holds none. Fields of later slices are added. */
const SETTINGS = {
  /** Auto, High or Low (ADR-0002 §9, rendering). */
  quality: Quality,
  /** Reduce animations even where the system does not ask it. */
  calm: z.boolean(),
  /** The 3D on a phone, where the list is the default. */
  phone3d: z.boolean(),
};

/** The streak by UTC day: the last day counted, the days in a row to it, the longest run. */
const Streak = z.strictObject({ day: Day, count: Count, best: Count });
/** Today's expedition: its UTC day and the stops reached that day. */
const ExpeditionDone = z.strictObject({ day: Day, reached: z.array(Key).check(z.maxLength(32)) });
/** A reminder of an event: whether it fired, so it fires once. */
const Reminder = z.strictObject({ fired: z.boolean() });

/** The notifications read: every one up to `through`, and the ones marked read one by one after it, by id. */
const NotificationsRead = z.strictObject({
  through: z.nullable(Time),
  ids: z.array(Key).check(z.maxLength(FOLLOWS_KEPT)),
});

// How a field is read from the device and written back: `read` takes what the key holds and gives the field and what it could not read
// (kept to write back), or none for another shape; `write` gives what the key keeps.
interface Codec<T> {
  read: (raw: unknown) => { value: T; strange: unknown } | undefined;
  write: (value: T, strange: unknown) => unknown;
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw);

// A record by key: the entries its schema reads, at most `kept`; the others kept aside.
const recordOf = <T>(entry: z.ZodMiniType<T>, kept: number): Codec<Record<string, T>> => ({
  read: (raw) => {
    if (!isRecord(raw)) return undefined;
    const good: [string, T][] = [];
    const strange: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const read = entry.safeParse(value);
      if (read.success && Key.safeParse(key).success && good.length < kept) good.push([key, read.data]);
      else strange[key] = value;
    }
    return { value: Object.fromEntries(good), strange };
  },
  write: (value, strange) => ({ ...(isRecord(strange) ? strange : {}), ...value }),
});

// One value: a value its schema refuses is another shape.
const oneOf = <T>(schema: z.ZodMiniType<T>): Codec<T> => ({
  read: (raw) => {
    const read = schema.safeParse(raw);
    return read.success ? { value: read.data, strange: undefined } : undefined;
  },
  write: (value) => value,
});

const CODECS: { [K in DeviceField]: Codec<DeviceFields[K]> } = {
  settings: {
    // Each setting apart: one the page cannot read takes its default, and a newer page's are kept.
    read: (raw) => {
      if (!isRecord(raw)) return undefined;
      const value = { ...DEFAULT_SETTINGS };
      const strange: Record<string, unknown> = {};
      for (const [key, held] of Object.entries(raw)) {
        const schema = Object.hasOwn(SETTINGS, key) ? SETTINGS[key as keyof Settings] : undefined;
        const read = schema?.safeParse(held);
        if (read?.success === true) Object.assign(value, { [key]: read.data });
        else strange[key] = held;
      }
      return { value, strange };
    },
    write: (value, strange) => ({ ...(isRecord(strange) ? strange : {}), ...value }),
  },
  stamps: recordOf(Day, STAMPS_KEPT),
  charted: recordOf(Day, STAMPS_KEPT),
  streak: oneOf(z.nullable(Streak)),
  expedition: oneOf(z.nullable(ExpeditionDone)),
  quests: recordOf(z.array(Key).check(z.maxLength(64)), STAMPS_KEPT),
  follows: {
    // Each list apart, its entries that are none dropped: a world's key, a person's address.
    read: (raw) => {
      if (!isRecord(raw)) return undefined;
      const listed = (held: unknown, entry: z.ZodMiniType<string>) =>
        [...new Set(Array.isArray(held) ? held.filter((one) => entry.safeParse(one).success) : [])]
          .filter((one): one is string => typeof one === "string")
          .slice(0, FOLLOWS_KEPT);
      const { worlds, people, ...strange } = raw;
      return { value: { worlds: listed(worlds, Key), people: listed(people, Address) }, strange };
    },
    write: (value, strange) => ({ ...(isRecord(strange) ? strange : {}), ...value }),
  },
  reminders: recordOf(Reminder, FOLLOWS_KEPT),
  notificationsRead: oneOf(NotificationsRead),
};

/** What this device keeps, on the storage `storage` reaches. */
function device(storage: () => DraftStorage): Device {
  const keys = Object.fromEntries(Object.keys(CODECS).map((field) => [field, `gnoworld:device:${field}`])) as Record<
    DeviceField,
    string
  >;
  // What each key held that this page could not read, from its last read: written back with the field.
  const strange: Partial<Record<DeviceField, unknown>> = {};
  const codec = <K extends DeviceField>(field: K) => CODECS[field] as Codec<DeviceFields[K]>;
  return {
    keys,
    read: (field) => {
      try {
        const held = storage().getItem(keys[field]);
        if (held === null) return DEVICE_EMPTY[field];
        let raw: unknown;
        try {
          raw = JSON.parse(held);
        } catch {
          raw = undefined;
        }
        const read = codec(field).read(raw);
        if (read === undefined) storage().removeItem(keys[field]);
        strange[field] = read?.strange;
        return read?.value ?? DEVICE_EMPTY[field];
      } catch {
        return undefined;
      }
    },
    write: (field, value) => {
      try {
        const kept = codec(field).write(value, strange[field]);
        const text = JSON.stringify(kept);
        if (text === JSON.stringify(DEVICE_EMPTY[field])) storage().removeItem(keys[field]);
        else storage().setItem(keys[field], text);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** What this device keeps for whoever uses it, on the page's localStorage, reached at each use (reaching it may itself throw). */
export const pageDevice = (): Device => device(() => localStorage);

/** The passport's part of the device as a file people keep: its stamps and the worlds charted, with the file's own version. */
export const passportFile = ({ stamps, charted }: Pick<DeviceFields, "stamps" | "charted">): string =>
  JSON.stringify({ gnoworld: "passport", version: 1, stamps, charted });

/** The longest passport file read: 10,000 stamps and as many worlds charted, with room to spare. */
const PASSPORT_FILE_MOST = 2_000_000;

/** A passport file read back, whole or not at all: its stamps and worlds charted replace the device's, never merged entry by entry; none for
 * a file too long, not JSON, of another kind or version, or holding an entry that is none. */
export function readPassportFile(text: string): Pick<DeviceFields, "stamps" | "charted"> | undefined {
  if (text.length > PASSPORT_FILE_MOST) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw["gnoworld"] !== "passport" || raw["version"] !== 1) return undefined;
  const stamps = CODECS.stamps.read(raw["stamps"]);
  const charted = CODECS.charted.read(raw["charted"]);
  const whole = (read: { strange: unknown } | undefined) =>
    read !== undefined && isRecord(read.strange) && Object.keys(read.strange).length === 0;
  if (stamps === undefined || charted === undefined || !whole(stamps) || !whole(charted)) return undefined;
  return { stamps: stamps.value, charted: charted.value };
}
