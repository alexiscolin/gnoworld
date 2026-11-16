// A place's own page on a phone, whose full chat has no plate beside it: the route's plate (RealmPlate, HubPlate or EarthPlate, the
// component the page draws under 900 px), handed down through PlaceChat (placePage.ts) because a feature never imports a route. PhoneInfo
// shows it in its own sheet in place of the info: the button here opens it, the page here is what it shows. The element is lazy: its chunk
// is asked when the page is drawn, on the press.
import { Button } from "@gnoworld/ui";
import { Suspense } from "react";
import { ErrorView, errorKind } from "../errors/index.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { Failing } from "./Failing.tsx";
import { usePlacePage } from "./placePage.ts";
import { PlateFrame } from "./PlateFrame.tsx";

/** The control that opens the place's page; nothing for a place with no page. */
export function PageButton({ onOpen }: { onOpen: () => void }) {
  const plate = usePlacePage();
  if (plate === null || plate === undefined) return null;
  return (
    <Button emphasis="outline" icon="news" description="Opens the place's page" onClick={onOpen}>
      Its page
    </Button>
  );
}

/** The place's page, in the frame the page gives its plate. A plate that fails to load or to draw is said, never a blank; the route
 * makes its plate with `chunked` (Failing.tsx), which asks its chunk again, so this boundary holds a failure of the drawing alone. */
export function PlacePage({ place }: { place: ChatPlace }) {
  const plate = usePlacePage();
  return (
    <PlateFrame label={place.name}>
      <Failing fallback={(error) => <ErrorView kind={errorKind(error)} size="inline" urgent />} renew={() => undefined}>
        <Suspense fallback={<p role="status">Loading the page…</p>}>{plate}</Suspense>
      </Failing>
    </PlateFrame>
  );
}
