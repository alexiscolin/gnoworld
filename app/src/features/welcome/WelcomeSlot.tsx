// The welcome card's place in the shell: its chunk is asked once the page rests, at a first visit of a logged-out reader, on a
// page of space (the home, the Earth, a world, a realm) and not in the full chat; the first screen holds only this.
import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router";
import { asksFull, holdsChat } from "../../fullChat.ts";
import { useAfterLoad } from "../../later.ts";
import { site } from "../../places.ts";
import { useApp } from "../../storeContext.tsx";
import { unseen } from "./seen.ts";

const Welcome = lazy(async () => ({ default: (await import("./Welcome.tsx")).Welcome }));

export function WelcomeSlot() {
  const { pathname, search } = useLocation();
  const out = useApp((state) => state.login.session.kind === "out");
  const rested = useAfterLoad();
  // Read when the page mounts, and kept: the card's own use writes the flag, which must not take it from under its fade.
  const [first] = useState(unseen);
  const [drawn, setDrawn] = useState(false);
  const onSpace = holdsChat(pathname) || pathname === site.universeAt(pathname).home.path;
  const ask = first && out && rested && onSpace && !asksFull(new URLSearchParams(search));
  if (ask && !drawn) setDrawn(true);
  return drawn ? (
    <Suspense fallback={null}>
      <Welcome />
    </Suspense>
  ) : null;
}
