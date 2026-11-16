// The full chat in the address (?chat=full): read by the chat (features/chat/full.ts), by space (useSpace draws the chat at once), and here
// before React draws, so a page opened full shows the chat's cover from its first paint and space never starts behind it.
import { PHONE_QUERY } from "@gnoworld/core";
import { cosmosAt } from "./cosmosAt.ts";

/** The address's key for the chat's size. */
export const FULL = "chat";

/** Whether the address asks for the full chat. */
export const asksFull = (params: URLSearchParams): boolean => params.get(FULL) === "full";

// The pages that hold a chat, in any universe: the Earth's, a world's, a realm's.
const CHAT_PAGE = /^(?:\/net\/[^/]+)?\/(?:earth\/?$|w\/|r\/)/;

/** Whether the page at `path` holds a chat: a world's, a realm's or the Earth's, the header's World (places.ts). */
export const holdsChat = (path: string): boolean => CHAT_PAGE.test(path);

/** The move between the dock and the full chat, one clock for the chat's grow (features/chat/fullMove.ts) and the page's ghost, which
 * dissolves in place under it (features/universe/rise.ts): the curve is space's flights' own, a cubic in and out. */
export const FULL_MOVE = { duration: 0.9, ease: "power2.inOut" } as const;

// The dock's box as the chat goes full, which the full chat grows out of (features/chat/fullMove.ts), or where the control that opened it from
// a page with no dock (the galaxy, a system) stood: the chat grows out of it, and shrinks back into it where it goes back to that page.
let dock: DOMRect | undefined;
let origin: DOMRect | undefined;

/** The page's chat, docked: every place's page holds it in `#chat`. */
const dockBox = (): DOMRect | undefined => document.getElementById("chat")?.getBoundingClientRect();

/** Before the chat goes full, from its own Expand or the header's Chat: the dock's box, which the full chat grows out of; on a page with no
 * dock, the box of the `control` that asked for it. */
export function leaveDock(control?: Element): void {
  dock = dockBox();
  origin = dock === undefined ? control?.getBoundingClientRect() : undefined;
  dock ??= origin;
}

/** Where the chat shrinks to as it goes: the page's dock, else the control it came out of. The control's box stays until a dock is found or the
 * chat opens again (a development build mounts, unmounts and mounts a chat once more, which would take it too soon). */
export function takeBack(): DOMRect | undefined {
  const box = dockBox();
  if (box === undefined) return origin;
  origin = undefined;
  return box;
}

/** The dock's box the full chat grows out of, taken once. */
export function takeDock(): DOMRect | undefined {
  const box = dock;
  dock = undefined;
  return box;
}

/** The page at `pathname`, its search `params` less the full chat's mark: where the full chat's own close leaves it for (FullButton.tsx). */
export function withoutFull(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  rest.delete(FULL);
  const search = rest.toString();
  return search === "" ? pathname : `${pathname}?${search}`;
}

/** A link to a page, kept in the full chat when the page holds one (routerLink.tsx): what is in the full chat stays in it, and a page
 * with no chat opens as itself. A link in the page's own search ("?room=…") keeps it already (names.ts). */
export function fullChatHref(href: string): string {
  const [path = "", query = ""] = href.split("?", 2);
  if (!holdsChat(path)) return href;
  const [search = "", hash] = query.split("#", 2);
  const params = new URLSearchParams(search);
  params.set(FULL, "full");
  return `${path}?${params.toString()}${hash === undefined ? "" : `#${hash}`}`;
}

const ECOSYSTEM_PAGE = /^(?:\/net\/[^/]+)?\/e\//;

/** Where a phone leaves the address `at` for, a phone being the full chat only: a place goes to its full chat (what the address asked of
 * the room or the person kept), the cosmos's addresses and an ecosystem's to the universe's `home`; none anywhere else, on a computer or
 * in the full chat already. */
export function phoneGoes(
  phone: boolean,
  at: { readonly pathname: string; readonly search: string; readonly hash: string },
  home: string,
): string | undefined {
  if (!phone) return undefined;
  if (cosmosAt(at.pathname) !== undefined || ECOSYSTEM_PAGE.test(at.pathname)) return home;
  if (!holdsChat(at.pathname) || asksFull(new URLSearchParams(at.search))) return undefined;
  return `${fullChatHref(`${at.pathname}${at.search}`)}${at.hash}`;
}

/** Marks the root of a chat's page opened full (data-chat="full", shellHeader.module.css's cover, space/motion.ts's pause), before React
 * draws; the chat keeps or drops the mark as it opens or shrinks. */
export function markFullEarly(): void {
  if (typeof document === "undefined") return;
  // A phone's place is its full chat: the address says so before React reads it, so the page's own first paint never shows.
  const to = phoneGoes(matchMedia(PHONE_QUERY).matches, location, "");
  if (to !== undefined && to !== "") history.replaceState(history.state, "", to);
  if (!holdsChat(location.pathname)) return;
  if (!asksFull(new URLSearchParams(location.search))) return;
  document.documentElement.dataset["chat"] = "full";
}
