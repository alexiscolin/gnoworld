// The rooms' reconciler (slice 3's plan, 3m): each room as Ergo holds it, read through the link (its
// flags, its invite list, who is in it with what power), made what its type says by the fewest commands.
// It runs when the link is in its rooms, on a timer and on a JOIN, so an operator's drift or a lost
// channel comes back, and a member taken off the file is put out. Read whole in review: a wrong command
// here opens a room or hands out power.
import { NICK, type Command } from "../irc/lines.ts";
import type { Log } from "@gnoworld/service/log";
import type { Desired } from "./types.ts";

/** A room in Ergo: its flags, its invite list by account, and who is in it with their prefixes. */
export interface RoomState {
  flags: string;
  invites: string[];
  present: { nick: string; powers: string }[];
}

// The reconciler's own flags put on or taken off, then its invites, a wildcard an operator set included.
function listChanges(state: RoomState, want: Desired): string[][] {
  const out: string[][] = [];
  for (const flag of want.modes) if (!state.flags.includes(flag)) out.push([`+${flag}`]);
  for (const flag of state.flags) if ("MmisR".includes(flag) && !want.modes.includes(flag)) out.push([`-${flag}`]);
  for (const who of want.invites) if (!state.invites.includes(who)) out.push(["+I", who]);
  for (const mask of state.invites) if (!want.invites.includes(mask)) out.push(["-I", mask]);
  return out;
}

// A person but the bot: any power above voice taken (founder, admin, op and half-op, by the prefixes NAMES
// shows), and voiced as the type says; one put out keeps their voice, which goes with them.
function powerChanges({ nick, powers }: RoomState["present"][number], voice?: ReadonlySet<string>): string[][] {
  const out: string[][] = [];
  for (const [prefix, letter] of Object.entries({ "~": "q", "&": "a", "@": "o", "%": "h" }))
    if (powers.includes(prefix)) out.push([`-${letter}`, nick]);
  const voiced = powers.includes("+");
  if (voice !== undefined && voice.has(nick) !== voiced) out.push([voiced ? "-v" : "+v", nick]);
  return out;
}

/** What a room needs to be as its type says: the reconciler's own flags (M, m, i, s, R) put on or taken
 * off, its invites, then each person but the bot stripped of any power above voice, and voiced as the type
 * says, or put out of a closed room they are not invited to, the bot's own op taken first when it lacks it. */
export function changes(room: string, state: RoomState, want: Desired): [Command, ...string[]][] {
  const out: [Command, ...string[]][] = listChanges(state, want).map((mode) => ["SAMODE", room, ...mode]);
  // Looked up for each of up to 10,000 people (F592).
  const [invited, voice] = [new Set(want.invites), new Set(want.voiced)];
  const kicks: [Command, ...string[]][] = [];
  for (const person of state.present.filter(({ nick }) => nick !== NICK)) {
    const outside = want.modes.includes("i") && !invited.has(person.nick);
    // A KICK needs a channel operator above the person: their powers go first.
    const powers = powerChanges(person, outside ? undefined : voice);
    out.push(...powers.map((mode): [Command, ...string[]] => ["SAMODE", room, ...mode]));
    if (outside) kicks.push(["KICK", room, person.nick, "not on this room's list"]);
  }
  // Back by SAJOIN after a restart, the bot is no channel operator (slice 3's max review): its op first.
  const bot = state.present.find(({ nick }) => nick === NICK)?.powers ?? "";
  if (kicks.length > 0 && !/[~&@]/.test(bot)) out.unshift(["SAMODE", room, "+o", NICK]);
  return [...out, ...kicks];
}

interface Options {
  rooms: () => readonly string[];
  desired: (room: string) => Desired;
  state: (room: string) => Promise<RoomState | undefined>;
  send: (command: Command, params: readonly string[]) => boolean;
  log: Log;
  // Who is in a room, by nick, as each read finds them (7h: who-is-here counts them).
  seen?: ((room: string, present: readonly string[]) => void) | undefined;
}

export interface Reconciler {
  // Every room, or one; a room asked while a pass runs is done in it, after the others, each room once.
  ask: (room?: string) => void;
  // As ask, settling once no room waits.
  pass: (room?: string) => Promise<void>;
  // Someone else joined a room: only a room whose type voices someone has a change to make (F582).
  joined: (room: string) => void;
  // Each room's flags put on at once, before any state is read: sent with the link's JOINs, a room Ergo
  // lost and the bot makes again is closed from its first line (Ergo keeps a channel's history). An open
  // room, which Ergo makes invite-only too (+i, default-modes), is opened by the pass, which then sees it.
  flags: () => void;
}

export function makeReconciler({ rooms, desired, state, send, log, seen }: Options): Reconciler {
  const waiting = new Set<string>();
  let running: Promise<void> | undefined;
  // A room Ergo did not answer for waits for the next pass.
  const one = async (room: string): Promise<void> => {
    const now = await state(room);
    if (now === undefined) return;
    seen?.(
      room,
      now.present.map(({ nick }) => nick),
    );
    // What the link sent: a link down or a form lines.ts refuses changes nothing, and logs nothing (F581).
    const sent = changes(room, now, desired(room)).filter(([command, ...params]) => send(command, params));
    if (sent.length === 0) return;
    log("room_reconciled", { room });
    // A room the file made open, or no longer names, loses its invite-only flag: its history opens with it. One
    // Ergo just made holds no invite list (+i is its default): opening it is no news.
    if (now.invites.length > 0 && sent.some(([command, , flag]) => command === "SAMODE" && flag === "-i")) {
      log("alert", { error: "room_opened", room });
    }
  };
  // One room at a time; one whose state or changes failed is passed over, and the next pass asks it again.
  // ponytail: a pass lasts rooms x Ergo's answer, 10 s for a silent room; read a few at once if that grows.
  const drain = async (): Promise<void> => {
    for (const room of waiting) {
      waiting.delete(room);
      try {
        await one(room);
      } catch (error) {
        log("room_unreconciled", { room, error: error instanceof Error ? error.name : "unknown" });
      }
    }
  };
  const ask = (room?: string): void => {
    for (const name of room === undefined ? rooms() : [room]) waiting.add(name);
    // Cleared once the pass has settled, never inside it: a pass that found no room ends too.
    running ??= drain().finally(() => {
      running = undefined;
    });
  };
  return {
    ask,
    flags: () => {
      for (const room of rooms()) for (const flag of desired(room).modes) send("SAMODE", [room, `+${flag}`]);
    },
    // ponytail: a JOIN reads the whole room again (10,000 people at most, a few ms); voice the joiner alone
    // if busy rooms that voice grow.
    joined: (room) => {
      if (desired(room).voiced.length > 0) ask(room);
    },
    pass: (room) => {
      ask(room);
      return running ?? Promise.resolve();
    },
  };
}
