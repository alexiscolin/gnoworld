// Direct messages' slice of the store (slice 4's 4e): each conversation an account has with another, by that
// account, its newest lines in time order, each once. Ergo's lines reach it as they reach the rooms' slice; a
// guest has none, nor does a partner that is no account's address.
import type { IrcMessage, Line, Reaction } from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";
import type { Drafts } from "../lib/drafts/drafts.ts";
import { afterAct, afterLine, dmFor, keptWith, withOf } from "../lib/dms/events.ts";
import { LINES_KEPT, REACTIONS_KEPT, type ChatSlice } from "./chat.ts";

/** What the slice writes on an account's device. */
export interface DmDevice {
  /** The account's drafts, where a line Ergo refused goes back. */
  drafts: Drafts;
}

/** What a line Ergo refused was tagged with: the msgid it answered, or the one it corrected. */
export interface RefusedTags {
  reply?: string;
  edit?: string;
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
  /** The lines Ergo refused this session, by partner: how many, the last one's draft, which the composer takes
   * back, `offline: false` when Ergo refused that one for another reason than its partner not connected, and its
   * `tags` (a reply's, a correction's) when its draft went back on the device, for the composer to take them back too. */
  dmRefused: Readonly<Record<string, { count: number; draft: string; offline?: false; tags?: RefusedTags }>>;
  dmActions: {
    /** One live line from Ergo: a direct message is kept with its partner; any other changes nothing. */
    heard: (message: IrcMessage) => void;
    /** A new session: the last one's conversations forgotten, an account's being its own, its device given; none for a guest. */
    begin: (device?: DmDevice) => void;
    /** A line Ergo refused, its partner not connected unless `offline` is false: its draft back on the device, the
     * refusal counted, with the `tags` the line went with when the draft is back (CR2). */
    refused: (partner: string, draft: string, how?: { offline?: boolean; tags?: RefusedTags | undefined }) => void;
    /** Ergo refused an act of the page's in a conversation: a delete of the line, or a reaction. */
    actRefused: (partner: string, act: { deleted: string } | { reacted: true }) => void;
    /** The page said what Ergo refused in a conversation: forgotten. */
    dismissed: (partner: string) => void;
  };
}

/** The conversations kept at most, those heard last: a room's bound (max-channels-per-client). */
export const DMS_KEPT = 100;

// What a reaction or a delete (4d's DM bar) changes of a conversation held: nothing, and no notice, when it changes none.
function actsOn(
  { dms, dmReactions }: Pick<DmSlice, "dms" | "dmReactions">,
  message: IrcMessage,
  partner: string,
): Pick<DmSlice, "dms" | "dmReactions"> | undefined {
  const lines = dms[partner];
  if (lines === undefined) return undefined;
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

// The draft back on the device where none waits: whether it went back.
function putBack(drafts: Drafts | undefined, partner: string, draft: string): boolean {
  if (drafts?.get(partner) !== "") return false;
  drafts.set(partner, draft);
  return true;
}

export const dmSlice: StateCreator<ChatSlice & DmSlice, [], [], DmSlice> = (set, get) => {
  // The session's device: the store's alone.
  let device: DmDevice | undefined;
  return {
    dms: {},
    dmRefused: {},
    dmReactions: {},
    dmActRefused: {},
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
        // Heard last goes last; a conversation past the bound goes with its reactions.
        const next = afterLine(dms, dm, { lines: LINES_KEPT, kept: DMS_KEPT });
        if (next !== undefined) set({ dms: next, dmReactions: keptWith(get().dmReactions, next) });
      },
      begin: (next) => {
        device = next;
        const { dms, dmRefused, dmReactions, dmActRefused } = get();
        if ([dms, dmRefused, dmReactions, dmActRefused].some((each) => Object.keys(each).length > 0))
          set({ dms: {}, dmRefused: {}, dmReactions: {}, dmActRefused: {} });
      },
      refused: (partner, draft, { offline = true, tags } = {}) => {
        // Back on the device where no draft waits: one typed since stays (CR7); the tags follow a draft put back alone.
        const back = putBack(device?.drafts, partner, draft);
        const { dmRefused } = get();
        const count = (dmRefused[partner]?.count ?? 0) + 1;
        const kept = back && tags !== undefined ? { tags } : {};
        set({ dmRefused: { ...dmRefused, [partner]: { count, draft, ...(offline ? {} : { offline }), ...kept } } });
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
