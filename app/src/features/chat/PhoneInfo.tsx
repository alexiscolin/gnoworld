// The info of a place on a phone (under 900 px), where the wide full chat's info column has no room: a sheet over the chat holding that
// same Info (one copy of the panel's logic), opened from the chat's header. Its title and Close are ui's Dialog's, which gives the focus
// back to the control that opened it. Closed it holds nothing, so the planet's code (PlaceView's lazy MiniSpace, the engine and its
// textures) is asked only once the sheet is open. "Its page" swaps the sheet's content for the place's page, with a way back: one modal.
import type { ComponentProps, MouseEvent } from "react";
import { useRef, useState } from "react";
import { Button, Dialog } from "@gnoworld/ui";
import { Info } from "./Info.tsx";
import styles from "./PhoneInfo.module.css";
import { PageButton, PlacePage } from "./PlaceSheet.tsx";

type InfoProps = ComponentProps<typeof Info>;

// A link inside the sheet: one to its own page scrolls there within the sheet, with no history entry; one leaving for another page closes
// the sheet, as the rooms' drawer does; one opening a new tab leaves it open.
function follow(event: MouseEvent<HTMLElement>, onClose: () => void) {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (link === null || link.target === "_blank") return;
  const href = link.getAttribute("href");
  if (href?.startsWith("#") !== true) {
    onClose();
    return;
  }
  event.preventDefault();
  const target = event.currentTarget.ownerDocument.getElementById(decodeURIComponent(href.slice(1)));
  if (target !== null && event.currentTarget.contains(target)) target.scrollIntoView({ block: "start" });
}

export function PhoneInfo({
  open,
  onClose,
  place,
  panelRef,
  ...info
}: Omit<InfoProps, "buttons" | "close" | "page" | "panelRef"> &
  Partial<Pick<InfoProps, "panelRef">> & {
    open: boolean;
    onClose: () => void;
  }) {
  const ownRef = useRef<HTMLElement>(null);
  const [paged, setPaged] = useState(false);
  // A sheet closed from outside (a move to another place) opens on the info next time.
  if (!open && paged) setPaged(false);
  return (
    <Dialog title={paged ? "Its page" : "Info"} kicker={place.kicker} wide="screen" open={open} onClose={onClose}>
      {open ? (
        <div
          className={styles["sheet"]}
          onClick={(event) => {
            follow(event, onClose);
          }}
        >
          {paged ? (
            <>
              <Button
                emphasis="quiet"
                onClick={() => {
                  setPaged(false);
                }}
              >
                Back to Info
              </Button>
              <PlacePage place={place} />
            </>
          ) : (
            <Info
              {...info}
              place={place}
              panelRef={panelRef ?? ownRef}
              buttons={null}
              close={null}
              page={
                <div className={styles["page"]}>
                  <PageButton
                    onOpen={() => {
                      setPaged(true);
                    }}
                  />
                </div>
              }
            />
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
