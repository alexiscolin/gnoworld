// What the chat's link takes and offers (link.ts), apart from how it does it.
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import type { Keep } from "../../lib/keep/keep.ts";
import type { NoticePrefs } from "../../lib/notices/prefs.ts";
import type { DmDevice } from "../../store/dms.ts";
import type { createAppStore } from "../../store/index.ts";
import type { Composed, Reacting } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";

/** What the composer hands its writer: the draft as composed, and as typed (which a refused direct message puts back). */
export interface Say {
  composed: Composed;
  draft: string;
}

export interface LinkDeps {
  store: ReturnType<typeof createAppStore>;
  connect: (who: Who, on: Pick<ErgoOptions, "onState" | "onLine">) => Ergo;
  ticket: () => Promise<Result<{ ticket: string }>>;
  guest: () => string;
  /** An account's device, whose direct-message choices the store reads at its session's start; none in a test. */
  device?: ((account: Address) => DmDevice & { notices?: NoticePrefs }) | undefined;
  /** An account's saved lines and reading places on its device, which the store reads at its session's start; none in
   * a test. */
  keep?: ((account: Address) => Keep) | undefined;
}

export interface ChatLink {
  /** The rooms the world lists, in its order, and among them those where a mention of the whole room counts (4f-n). */
  follow: (ids: readonly string[], groupRooms?: readonly string[]) => void;
  /** The room in view: its history asked once Ergo says I joined it, once a connection; the last one's place told. */
  show: (room: string | undefined) => void;
  /** Sends what the composer composed (a visitor's page never loads it: budgets.spec.ts) for a room Ergo says it is
   * in; an account's alone; tagged +reply with the msgid it answers, one a tag carries (4d). A message of several lines
   * goes as one draft/multiline batch, or a line at a time to an Ergo without it. Whether it went. */
  say: (room: string, composed: Composed, reply?: string) => boolean;
  /** Sends what the composer composed, so, as a correction of the line `edit` names: tagged +gnoworld/edit with its
   * msgid, one a tag carries (the room's Edit). Whether it went. */
  correct: (room: string, composed: Composed, edit: string) => boolean;
  /** Sends what the composer composed to another account, a direct message (4e); an account's alone; `draft` is what
   * its writer typed (`say`), which Ergo's refusal puts back; tagged +reply with the msgid it answers or +gnoworld/edit with
   * the one it corrects, a msgid a tag carries. Whether it went. */
  sayTo: (partner: string, say: Say, tags?: { reply?: string; edit?: string }) => boolean;
  /** Whether a message of several lines goes whole as one batch, as far as the connection says: yes while there is none or
   * Ergo granted draft/multiline, no once it refused it (a line at a time, the composer's 20 at most). */
  multiline: () => boolean;
  /** Reacts to a line of the conversation with an account, or takes the reaction back (4d's DM bar); an account's alone,
   * to another account. Whether it went; Ergo's refusal (the partner not connected) reaches the store. */
  reactTo: (partner: string, reaction: Reacting) => boolean;
  /** Deletes a line of the conversation with an account, and each correction of mine to it (REDACT; Ergo lets an author
   * delete its own alone). Whether it went; Ergo's refusal reaches the store. */
  redactIn: (partner: string, id: string) => boolean;
  /** Deletes a line by its msgid in a room Ergo says it is in (Ergo's REDACT, 4c), and each correction of mine to it, which
   * a REDACT of the line leaves; an account's alone. Whether the line's went. */
  redact: (room: string, id: string) => boolean;
  /** Reacts to a line of a room Ergo says it is in, by its msgid, with one emoji of RGI's set, or takes the reaction
   * back (4d); an account's alone. Each is labelled, so Ergo's answer to it is known. Whether it went. */
  react: (room: string, reaction: Reacting) => boolean;
  /** Tells a room Ergo says it is in the account is typing, at most each 3 s, or done after (+typing); an account's. */
  typing: (room: string, state: "active" | "done") => void;
  /** Marks the room in view read to its line `id`, which the store holds, as Ergo's MARKREAD (draft/read-marker): an
   * account's alone, a line past the place Ergo gave; asked while away, it goes once Ergo says I am in the room. */
  read: (room: string, id: string) => void;
  /** Marks a room read to a time the page set from outside the room (Clear's), as Ergo's MARKREAD: an account's alone, a
   * room, not a conversation; asked while away, it goes once Ergo says I am in the room. */
  markRead: (room: string, time: string) => void;
  /** Sends at once the reading places waiting their 2 s, as the page hides (F940). */
  flush: () => void;
  stop: () => void;
}
