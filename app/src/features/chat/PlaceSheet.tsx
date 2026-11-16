// A place's own page in a sheet, for a phone, whose full chat has no plate beside it: the route's plate (RealmPlate, HubPlate or EarthPlate,
// the component the page draws under 900 px), handed down through PlaceChat (placePage.ts) because a feature never imports a route. The
// element is lazy: its chunk is asked when the sheet draws it, on the press.
import { Button, Dialog } from "@gnoworld/ui";
import { Component, Suspense, useState, type ReactNode } from "react";
import type { ChatPlace } from "./ChatScreen.tsx";
import { usePlacePage } from "./placePage.ts";
import styles from "./PhoneInfo.module.css";

// A plate that fails to load or to draw is said, in the sheet, never a blank.
class Failing extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p role="alert">The page could not be shown. Close this and try again.</p>
    ) : (
      this.props.children
    );
  }
}

/** The control that opens the place's page, and the sheet; nothing for a place with no page. */
export function PlaceSheet({ place }: { place: ChatPlace }) {
  const [open, setOpen] = useState(false);
  const plate = usePlacePage();
  if (plate === null || plate === undefined) return null;
  return (
    <>
      <Button
        emphasis="outline"
        icon="news"
        expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        Its page
      </Button>
      <Dialog
        title="Its page"
        kicker={place.kicker}
        wide
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        {open ? (
          // The phone's full-height sheet of PhoneInfo.module.css, as the info's own.
          <div className={styles["sheet"]}>
            <h3>{place.name}</h3>
            <Failing>
              <Suspense fallback={<p role="status">Loading the page…</p>}>{plate}</Suspense>
            </Failing>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
