import { pageLoginApi } from "../../lib/api/login.ts";
import { pageDrafts } from "../../lib/drafts/page.ts";
import { pageKeep } from "../../lib/keep/page.ts";
import { pageNoticePrefs } from "../../lib/notices/page.ts";
import { drawGuestNick } from "../../lib/ergo/ergo.ts";
import { pageErgo } from "../../lib/ergo/page.ts";
import type { useAppStore } from "../../storeContext.tsx";
import { chatLink, type ChatLink } from "./link.ts";

// The page's link to Ergo: the page's socket, the login's tickets, a guest's drawn nick, an account's device (its drafts and
// notices' modes, its saved lines and places).
const pageLink = (store: ReturnType<typeof useAppStore>) =>
  chatLink({
    store,
    connect: pageErgo,
    ticket: pageLoginApi().ticket,
    guest: drawGuestNick,
    device: (account) => ({
      drafts: pageDrafts(account),
      notices: pageNoticePrefs(account),
    }),
    keep: pageKeep,
    // What the link does for an account alone, asked as an account connects (the first screen's budget, ADR-0001 §12).
    loadKit: async () => (await import("./accountKit.ts")).makeKit,
  });

// The page's one link, shared by the panels drawn one after the other (the dock, the full chat, a next world's): it is let go once no panel
// holds it after the commit that moved from one to the next, so the dock and the full chat swap without a new connection and a history asked
// again.
let shared: { store: ReturnType<typeof useAppStore>; link: ChatLink; users: number } | undefined;

/** The page's link, made on the first panel that takes it. */
export function takeLink(store: ReturnType<typeof useAppStore>): ChatLink {
  if (shared?.store !== store) {
    shared?.link.stop();
    shared = { store, link: pageLink(store), users: 0 };
  }
  shared.users += 1;
  return shared.link;
}

/** A panel lets the link go. */
export function dropLink(): void {
  const mine = shared;
  if (mine === undefined) return;
  mine.users -= 1;
  queueMicrotask(() => {
    if (mine.users > 0) return;
    mine.link.stop();
    if (shared === mine) shared = undefined;
  });
}
