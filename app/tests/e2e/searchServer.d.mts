import type { Page } from "@playwright/test";

/** What the search index is given: a line as the server's `Said` (server/src/irc/link.ts). */
export interface SearchedLine {
  room: string;
  account: string;
  msgid: string;
  text: string;
  time: string;
}
export function answerSearchFrom(page: Page): Promise<{ add: (said: SearchedLine) => void }>;
