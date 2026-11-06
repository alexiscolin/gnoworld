// The fields this device keeps for whoever uses it (slice 8), their shapes and their defaults: what the store holds from the first screen.
// Reading and writing them, with their schemas, is device.ts's, which the page asks for once it runs.

export interface Settings {
  /** Auto, High or Low (ADR-0002 §9, rendering). */
  quality: "auto" | "high" | "low";
  /** Reduce animations even where the system does not ask it. */
  calm: boolean;
  /** The 3D on a phone, where the list is the default. */
  phone3d: boolean;
}
export const DEFAULT_SETTINGS: Settings = { quality: "auto", calm: false, phone3d: false };

/** The worlds followed, the people followed, the reminders and the notifications marked read kept at most, each: the device's reader
 * drops what is past it, and a feature that adds one keeps to it. */
export const FOLLOWS_KEPT = 500;

/** What the device keeps, field by field. */
export interface DeviceFields {
  settings: Settings;
  /** The UTC day each world was first visited on, by "universe:world". */
  stamps: Record<string, string>;
  /** The uncharted worlds this device was the first to visit, and the day, by "universe:world". */
  charted: Record<string, string>;
  /** The streak by UTC day: the last day counted, the days in a row to it, the longest run. */
  streak: { day: string; count: number; best: number } | null;
  /** Today's expedition: its UTC day and the stops reached that day. */
  expedition: { day: string; reached: string[] } | null;
  /** The steps done of each quest, by the quest's id. */
  quests: Record<string, string[]>;
  /** What is followed, the last followed first: worlds as "universe:world", people by their account's address, never a nick. */
  follows: { worlds: readonly string[]; people: readonly string[] };
  /** The reminders asked, by the event's id. */
  reminders: Record<string, { fired: boolean }>;
  /** The notifications read: every one up to `through` (a time), and the ones marked read one by one after it, by id. */
  notificationsRead: { through: string | null; ids: string[] };
}
export type DeviceField = keyof DeviceFields;

export const DEVICE_EMPTY: DeviceFields = {
  settings: DEFAULT_SETTINGS,
  stamps: {},
  charted: {},
  streak: null,
  expedition: null,
  quests: {},
  follows: { worlds: [], people: [] },
  reminders: {},
  notificationsRead: { through: null, ids: [] },
};

export interface Device {
  /** The field as the device holds it, its default for none; undefined when the device could not be read, which is then left as it is. */
  read: <K extends DeviceField>(field: K) => DeviceFields[K] | undefined;
  /** Keeps the field; whether the device took it. Its default removes the key. */
  write: <K extends DeviceField>(field: K, value: DeviceFields[K]) => boolean;
  /** The keys this device holds, to clear or export them by name. */
  readonly keys: Readonly<Record<DeviceField, string>>;
}
