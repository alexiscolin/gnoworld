// Direct messages' slice of the store (slice 4's 4e): each conversation an account has with another, by that
// account, its newest lines in time order, each once. Ergo's lines reach it as they reach the rooms' slice; a
// guest has none, nor does a partner that is no account's address. The account's choices (ADR-0002's "only from
// people I have talked with") are read from its device once, at its session's start, and written back on change.
import { addLines, dmOf, type IrcMessage, type Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import type { DmPrefs } from "../lib/dms/prefs.ts";
import type { Drafts } from "../lib/drafts/drafts.ts";
import { LINES_KEPT, type ChatSlice } from "./chat.ts";

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
  /** The session's account's choices: a guest's, or one with no device, hear everyone. */
  dmChoices: DmChoices;
  /** The lines Ergo refused this session, their partner not connected, by partner: how many, and the last one's
   * draft, which the composer takes back. */
  dmRefused: Readonly<Record<string, { count: number; draft: string }>>;
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
    /** A line Ergo refused, its partner not connected: its draft back on the device, the refusal counted. */
    refused: (partner: string, draft: string) => void;
  };
}

const NO_CHOICE: DmChoices = { onlyKnown: false, known: new Set() };

/** The conversations kept at most, those heard last: a room's bound (max-channels-per-client). */
export const DMS_KEPT = 100;

/** Whether the account hears from `partner` as it chose: from everyone, or from those it wrote to alone. */
export const heardFrom = ({ onlyKnown, known }: DmChoices, partner: string): boolean =>
  !onlyKnown || known.has(partner);

export const dmSlice: StateCreator<ChatSlice & DmSlice, [], [], DmSlice> = (set, get) => {
  // The session's device: the store's alone, read at the start and written on change.
  let device: DmDevice | undefined;
  return {
    dms: {},
    dmChoices: NO_CHOICE,
    dmRefused: {},
    dmActions: {
      heard: (message) => {
        const { chat, dms } = get();
        // The account read for a direct message alone, not for each of a room's lines.
        const dm = dmOf(message, chat.me ?? "");
        if (dm === undefined || !Address.safeParse(chat.me).success || !Address.safeParse(dm.partner).success) return;
        // My line, as Ergo echoes it once it delivered it: its partner is one I wrote to. Its line to me has its
        // nick as the partner.
        if (dm.partner !== dm.line.from) get().dmActions.know(dm.partner);
        // Refused means discarded (decision B): a stranger's line, while the account hears those it wrote to alone.
        if (!heardFrom(get().dmChoices, dm.partner)) return;
        const { [dm.partner]: held = [], ...others } = dms;
        const lines = addLines(held, [dm.line], LINES_KEPT);
        if (lines === held) return;
        // Heard last goes last; the oldest heard goes first past the bound.
        set({ dms: { ...Object.fromEntries(Object.entries(others).slice(1 - DMS_KEPT)), [dm.partner]: lines } });
      },
      begin: (next) => {
        device = next;
        const prefs = next?.prefs;
        const dmChoices =
          prefs === undefined ? NO_CHOICE : { onlyKnown: prefs.onlyKnown(), known: new Set(prefs.known()) };
        const { dms, dmChoices: before, dmRefused } = get();
        const held = Object.keys(dms).length + Object.keys(dmRefused).length;
        if (held > 0 || dmChoices !== before) set({ dms: {}, dmChoices, dmRefused: {} });
      },
      setOnlyKnown: (only) => {
        const { dmChoices } = get();
        if (dmChoices.onlyKnown === only) return;
        set({ dmChoices: { ...dmChoices, onlyKnown: only } });
        device?.prefs.setOnlyKnown(only);
      },
      know: (partner) => {
        const { dmChoices } = get();
        if (!dmChoices.known.has(partner))
          set({ dmChoices: { ...dmChoices, known: new Set([...dmChoices.known, partner]) } });
        device?.prefs.know(partner);
      },
      refused: (partner, draft) => {
        device?.drafts.set(partner, draft);
        const { dmRefused } = get();
        set({ dmRefused: { ...dmRefused, [partner]: { count: (dmRefused[partner]?.count ?? 0) + 1, draft } } });
      },
    },
  };
};
