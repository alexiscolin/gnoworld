// The chat (slice 4's 4b): a world's rooms by section, a room's lines and people, the page's link to Ergo.
import { lazy } from "react";

export { ChainCallsContext, ChainPlaceContext } from "./chainThread.ts";
export { Chat } from "./Chat.tsx";
export { useChatAlone } from "./full.ts";
export { chatHeld, DockedChatHost, FullChatHost, PlaceChat } from "./fullHost.tsx";
export type { ChatProps } from "./Chat.tsx";
export { LOADING } from "./Loading.tsx";
export { roomsChanged } from "./roomsListed.ts";
export {
  dmHref,
  roomHref,
  roomIds,
  roomLabel,
  roomParams,
  roomWorld,
  shortAddress,
  shownRoom,
  whoIs,
} from "./names.ts";

/** The chat's drawing of marks, paragraphs, code and lists, for a realm's page. Loaded on asking, never by the barrel:
 * a static re-export put the Markdown reader in every world page's first screen (budgets.spec.ts, accountLater.spec.ts). */
export async function drawing() {
  const { ANONYMOUS, block, drawInlines } = await import("./Message.tsx");
  return { reader: ANONYMOUS, block, inlines: drawInlines };
}
export type Drawing = Awaited<ReturnType<typeof drawing>>;
export type { ChatPlace } from "./ChatScreen.tsx";
export { chatPlace, EARTH_CHAT, EARTH_KICKER } from "./place.ts";

// The settings' country and the account menu's saved messages (slice 8), each in a chunk asked when its dialog opens: a static export put
// them in every world page's first screen.
export const CountryChoice = lazy(async () => ({ default: (await import("./CountryChoice.tsx")).CountryChoice }));
export const SavedDialog = lazy(async () => ({ default: (await import("./SavedDialog.tsx")).SavedDialog }));
