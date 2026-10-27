// Direct messages' slice of the store (slice 4's 4e): each conversation an account has with another, by that
// account, its newest lines in time order, each once. Ergo's lines reach it as they reach the rooms' slice; a
// guest has none, nor does a partner that is no account's address. The account's choices (ADR-0002's "only from
// people I have talked with") are read from its device once, at its session's start, and written back on change.
import type { IrcMessage, Line, Reaction } from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";
import { KNOWN_KEPT, type DmPrefs } from "../lib/dms/prefs.ts";
import type { Drafts } from "../lib/drafts/drafts.ts";
import { afterAct, afterLine, dmFor, keptWith, withOf } from "../lib/dms/events.ts";
import { LINES_KEPT, REACTIONS_KEPT, type ChatSlice } from "./chat.ts";

/** An account's choices for its direct messages. */
export interface DmChoices {
  /** Whether it hears from the accounts it wrote to alone. */
  onlyKnown: boolean;
  /** The accounts it wrote to. */
  known: ReadonlySet<string>;
}

/** What the slice reads and writes on an account's device. */
export interface DmDevice {
  prefs: DmPrefs;
  /** The account's drafts, where a line Ergo refused goes back. */
  drafts: Drafts;
}

export interface DmSlice {
  /** Direct messages by the account they are with, each its newest lines (the store's window), the conversation
   * heard last last. */
  dms: Readonly<Record<string, readonly Line[]>>;
  /** The reactions to each conversation's lines, by partner, as a room's (4d's DM bar): only a conversation held has any. */
  dmReactions: Readonly<Record<string, readonly Reaction[]>>;
  /** What Ergo refused of the page's acts in a conversation, by partner, until the page said so: the line whose delete it
   * refused, and a reaction (a partner not connected, 401). */
  dmActRefused: Readonly<Record<string, { deleted?: string; reacted?: true }>>;
  /** The session's account's choices: a guest's, or one with no device, hear everyone. */
  dmChoices: DmChoices;
  /** The lines Ergo refused this session, by partner: how many, the last one's draft, which the composer takes
   * back, and `offline: false` when Ergo refused that one for another reason than its partner not connected. */
  dmRefused: Readonly<Record<string, { count: number; draft: string; offline?: false }>>;
  /** Whether the session's device failed to keep the choices: it refused a write, or could not be read (CR5). */
  dmNotKept: boolean;
  dmActions: {
    /** One live line from Ergo: a direct message is kept with its partner; any other changes nothing. */
    heard: (message: IrcMessage) => void;
    /** A new session: the last one's conversations forgotten, an account's being its own, and its choices read
     * from its device, none for a guest. */
    begin: (device?: DmDevice) => void;
    /** Hears from the accounts written to alone, or from everyone; kept on the device. */
    setOnlyKnown: (only: boolean) => void;
    /** Notes an account written to, once Ergo delivered my line to it; kept on the device. */
    know: (partner: string) => void;
    /** A line Ergo refused, its partner not connected unless `offline` is false: its draft back on the device, the
     * refusal counted. */
    refused: (partner: string, draft: string, offline?: boolean) => void;
    /** Ergo refused an act of the page's in a conversation: a delete of the line, or a reaction. */
    actRefused: (partner: string, act: { deleted: string } | { reacted: true }) => void;
    /** The page said what Ergo refused in a conversation: forgotten. */
    dismissed: (partner: string) => void;
  };
}

const NO_CHOICE: DmChoices = { onlyKnown: false, known: new Set() };

/** The conversations kept at most, those heard last: a room's bound (max-channels-per-client). */
export const DMS_KEPT = 100;

/** Whether the account hears from `partner` as it chose: from everyone, or from those it wrote to alone. */
export const heardFrom = ({ onlyKnown, known }: DmChoices, partner: string): boolean =>
  !onlyKnown || known.has(partner);

// What a reaction or a delete (4d's DM bar) changes of a conversation held: nothing, and no notice, when it changes none.
function actsOn(
  { dms, dmReactions, dmChoices }: Pick<DmSlice, "dms" | "dmReactions" | "dmChoices">,
  message: IrcMessage,
  partner: string,
): Pick<DmSlice, "dms" | "dmReactions"> | undefined {
  const lines = dms[partner];
  if (lines === undefined || !heardFrom(dmChoices, partner)) return undefined;
  const was = { lines, reactions: dmReactions[partner] };
  const now = afterAct(was, message, REACTIONS_KEPT);
  if (now === was) return undefined;
  return {
    dms: now.lines === lines ? dms : { ...dms, [partner]: now.lines },
    dmReactions:
      now.reactions === was.reactions || now.reactions === undefined
        ? dmReactions
        : { ...dmReactions, [partner]: now.reactions },
  };
}

export const dmSlice: StateCreator<ChatSlice & DmSlice, [], [], DmSlice> = (set, get) => {
  // The session's device: the store's alone, read at the start and written on change.
  let device: DmDevice | undefined;
  // The accounts written to, the last one last, as the device keeps them: read once a session, written when the last
  // one changes (CR3); never written over a device that could not be read (CR4).
  let written: string[] = [];
  let writable = false;
  return {
    dms: {},
    dmChoices: NO_CHOICE,
    dmRefused: {},
    dmReactions: {},
    dmActRefused: {},
    dmNotKept: false,
    dmActions: {
      heard: (message) => {
        const { chat, dms } = get();
        const partner = withOf(message, chat.me ?? "");
        if (partner !== undefined) {
          const patch = actsOn(get(), message, partner);
          if (patch !== undefined) set(patch);
          return;
        }
        // The account read for a direct message alone, not for each of a room's lines.
        const dm = dmFor(message, chat.me ?? "");
        if (dm === undefined) return;
        // My line, as Ergo echoes it once it delivered it: its partner is one I wrote to. Its line to me has its
        // nick as the partner.
        if (dm.partner !== dm.line.from) get().dmActions.know(dm.partner);
        // Refused means discarded (decision B): a stranger's line, while the account hears those it wrote to alone.
        if (!heardFrom(get().dmChoices, dm.partner)) return;
        // Heard last goes last; a conversation past the bound goes with its reactions.
        const next = afterLine(dms, dm, { lines: LINES_KEPT, kept: DMS_KEPT });
        if (next !== undefined) set({ dms: next, dmReactions: keptWith(get().dmReactions, next) });
      },
      begin: (next) => {
        device = next;
        const prefs = next?.prefs;
        const read = prefs?.known();
        written = read ?? [];
        writable = read !== undefined;
        const dmChoices = prefs === undefined ? NO_CHOICE : { onlyKnown: prefs.onlyKnown(), known: new Set(written) };
        const dmNotKept = prefs !== undefined && !writable;
        const { dms, dmChoices: before, dmRefused, dmReactions, dmActRefused, dmNotKept: was } = get();
        if (
          [dms, dmRefused, dmReactions, dmActRefused].some((each) => Object.keys(each).length > 0) ||
          dmChoices !== before ||
          dmNotKept !== was
        )
          set({ dms: {}, dmChoices, dmRefused: {}, dmReactions: {}, dmActRefused: {}, dmNotKept });
      },
      setOnlyKnown: (only) => {
        const { dmChoices } = get();
        if (dmChoices.onlyKnown === only) return;
        set({ dmChoices: { ...dmChoices, onlyKnown: only } });
        if (device?.prefs.setOnlyKnown(only) === false) set({ dmNotKept: true });
      },
      know: (partner) => {
        if (written.at(-1) === partner) return;
        written = [...written.filter((each) => each !== partner), partner].slice(-KNOWN_KEPT);
        const { dmChoices } = get();
        if (!dmChoices.known.has(partner)) set({ dmChoices: { ...dmChoices, known: new Set(written) } });
        if (writable && device?.prefs.setKnown(written) === false) set({ dmNotKept: true });
      },
      refused: (partner, draft, offline = true) => {
        // Back on the device where no draft waits: one typed since stays (CR7).
        if (device?.drafts.get(partner) === "") device.drafts.set(partner, draft);
        const { dmRefused } = get();
        const count = (dmRefused[partner]?.count ?? 0) + 1;
        set({ dmRefused: { ...dmRefused, [partner]: offline ? { count, draft } : { count, draft, offline } } });
      },
      actRefused: (partner, act) => {
        const { dmActRefused } = get();
        set({ dmActRefused: { ...dmActRefused, [partner]: { ...dmActRefused[partner], ...act } } });
      },
      dismissed: (partner) => {
        const { dmActRefused } = get();
        if (!Object.hasOwn(dmActRefused, partner)) return;
        set({ dmActRefused: Object.fromEntries(Object.entries(dmActRefused).filter(([each]) => each !== partner)) });
      },
    },
  };
};
