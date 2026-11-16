// A place's own page on a phone, whose full chat has no plate beside it: the route's plate (RealmPlate, HubPlate or EarthPlate, the
// component the page draws under 900 px), handed down through PlaceChat (placePage.ts) because a feature never imports a route. PhoneInfo
// shows it in its own sheet in place of the info: the button here opens it, the page here is what it shows. The element is lazy: its chunk
// is asked when the page is drawn, on the press.
import { Button } from "@gnoworld/ui";
import { Suspense, useEffect } from "react";
import { ErrorView, errorKind } from "../errors/index.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { Failing } from "./Failing.tsx";
import { InPageSheet, usePlacePage } from "./placePage.ts";
import { PlateFrame } from "./PlateFrame.tsx";
import { sectionId } from "./sectionId.ts";

/** The control that opens the place's page; nothing for a place with no page. */
export function PageButton({ onOpen, primary = false }: { onOpen: () => void; primary?: boolean }) {
  const plate = usePlacePage();
  if (plate === null || plate === undefined) return null;
  return (
    <Button
      emphasis={primary ? "solid" : "outline"}
      {...(primary ? { size: "l" as const } : {})}
      icon="news"
      onClick={onOpen}
    >
      Its page
    </Button>
  );
}

// The section the address names (#page: the realm's page, where its proposals are), scrolled to once the plate has drawn it: the routes'
// plates are chunks of their own, so the section may come after the sheet. Only a section of the plate's own panel, never one of the
// chat behind the sheet. Watches the page for a bounded time and stops as it is found.
const WAIT_FOR_SECTION = 5000;
function ScrollToSection() {
  useEffect(() => {
    const id = sectionId(window.location.hash);
    if (id === undefined) return;
    const look = () => {
      const target = document.getElementById(id);
      if (!target?.closest("[data-look='plate']")) return false;
      target.scrollIntoView({ block: "start" });
      return true;
    };
    if (look()) return;
    const watch = new MutationObserver(() => {
      if (look()) watch.disconnect();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    const stop = setTimeout(() => {
      watch.disconnect();
    }, WAIT_FOR_SECTION);
    return () => {
      clearTimeout(stop);
      watch.disconnect();
    };
  }, []);
  return null;
}

/** The place's page, in the frame the page gives its plate. A plate that fails to load or to draw is said, never a blank; the route
 * makes its plate with `chunked` (Failing.tsx), which asks its chunk again, so this boundary holds a failure of the drawing alone. */
export function PlacePage({ place }: { place: ChatPlace }) {
  const plate = usePlacePage();
  return (
    <PlateFrame label={place.name}>
      <Failing fallback={(error) => <ErrorView kind={errorKind(error)} size="inline" urgent />} renew={() => undefined}>
        <Suspense fallback={<p role="status">Loading the page…</p>}>
          <InPageSheet value>{plate}</InPageSheet>
          <ScrollToSection />
        </Suspense>
      </Failing>
    </PlateFrame>
  );
}
