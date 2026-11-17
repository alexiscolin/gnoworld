// What a notice says: who did what. The chat's notices' list and the bell share it; the chat's first chunk holds none of it, a visitor
// having no notice (accountLater.spec.ts).
import type { Notice } from "@gnoworld/core";

const WORDS = {
  mention: "mentioned you",
  group: "mentioned the room",
  reply: "replied to you",
  dm: "wrote to you",
} as const;

/** Who did what of a notice, `who` as chat's whoIs names the sender: a row's title in the notices' list and the bell. */
export const noticeDone = (who: string, kind: Notice["kind"]): string => `${who} ${WORDS[kind]}`;
