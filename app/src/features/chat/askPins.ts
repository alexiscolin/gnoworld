// The shown room's pins (slice 4's 4d): asked of the server as the room is shown, again a minute after each answer
// while the page shows, and after the reader's own pin or unpin. Ergo tells nothing of pins (they are the server's,
// docs/decisions.md, 2026-10-27), so another moderator's change reaches a reader within a minute or at the next look.
// One request at a time; an answer given after the room or the reader changed, or after stopping, is dropped, since
// the right to pin is the reader's own.
import type { PinList } from "@gnoworld/schemas";
import type { Result } from "../../lib/api/http.ts";

/** How long after an answer the room's pins are asked again: the decision's minute. */
export const PINS_EVERY_MS = 60_000;

/** What the asker asks of, and tells. */
export interface Asking {
  pins: (room: string) => Promise<Result<PinList>>;
  pin: (room: string, msgid: string) => Promise<Result<PinList>>;
  unpin: (room: string, msgid: string) => Promise<Result<PinList>>;
  /** An answer, into the store. */
  set: (list: PinList) => void;
  /** Whether the page shows: none is asked while it is hidden. */
  visible: () => boolean;
}

/** A pin or an unpin: done, or why the server refused it. */
export type Done = { ok: true } | Exclude<Result<never>, { ok: true }>;

export function pinAsker({ pins, pin, unpin, set, visible }: Asking) {
  // The room and the reader shown, none for a direct message's; `run` counts each change of either, so an answer
  // asked for the last is known.
  let shown: { room: string | undefined; reader: string | undefined } = { room: undefined, reader: undefined };
  let run = 0;
  let waiting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (visible()) ask();
    }, PINS_EVERY_MS);
  };
  // An answer or a failure of the ask of this run alone ends its wait, and the minute starts again.
  function ask(): void {
    const { room } = shown;
    if (room === undefined || waiting) return;
    const mine = run;
    waiting = true;
    const done = (got?: Result<PinList>): void => {
      if (mine !== run) return;
      waiting = false;
      if (got?.ok === true) set(got.value);
      arm();
    };
    pins(room).then(done, () => {
      done();
    });
  }
  // A pin or an unpin: its answer is the room's pins as they now are, which the store takes; the minute starts again.
  const act = async (call: Asking["pin"], msgid: string): Promise<Done> => {
    const { room } = shown;
    if (room === undefined) return { ok: false, reason: "refused" };
    const mine = run;
    const got = await call(room, msgid);
    if (!got.ok) return got;
    if (mine === run) {
      set(got.value);
      arm();
    }
    return { ok: true };
  };
  return {
    /** The room in view and its reader: asked at once when either changed, none for no room. */
    show: (room: string | undefined, reader: string | undefined): void => {
      if (room === shown.room && reader === shown.reader) return;
      run += 1;
      waiting = false;
      clearTimeout(timer);
      shown = { room, reader };
      ask();
    },
    /** The page shows again: asked at once, when it shows. */
    refresh: (): void => {
      if (!visible()) return;
      clearTimeout(timer);
      ask();
    },
    pin: (msgid: string) => act(pin, msgid),
    unpin: (msgid: string) => act(unpin, msgid),
    stop: (): void => {
      run += 1;
      clearTimeout(timer);
    },
  };
}
