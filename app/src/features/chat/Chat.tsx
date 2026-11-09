// The chat on a world's page, its code asked once the page is usable: none of it is the first screen's (ADR-0001
// §12's budget). The build's pre-render and the hydration draw the same words; the panel follows.
import { lazy, Suspense, useSyncExternalStore } from "react";
import type { ChatPlace } from "./ChatScreen.tsx";
import { LOADING } from "./Loading.tsx";

const ChatPanel = lazy(() => import("./ChatPanel.tsx").then(({ ChatPanel: panel }) => ({ default: panel })));
const unchanging = () => () => undefined;

/** A chat's world, what it says of its place, and `room`, the name of the world's room the page is for (#<world>/<name>), where the
 * address names none. */
export interface ChatProps {
  world: string;
  place: ChatPlace;
  room?: string | undefined;
}

export function Chat({ world, place, room }: ChatProps) {
  // false in the pre-render and while hydrating, true after: React draws again, and the panel's code is asked.
  const running = useSyncExternalStore(
    unchanging,
    () => true,
    () => false,
  );
  return running ? (
    <Suspense fallback={LOADING}>
      <ChatPanel world={world} place={place} room={room} />
    </Suspense>
  ) : (
    LOADING
  );
}
