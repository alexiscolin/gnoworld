// The info of a place on a phone (under 900 px), where the wide full chat's info column has no room: a sheet over the chat holding that
// same Info (one copy of the panel's logic), opened from the chat's header. Its title and Close are ui's Dialog's, which gives the focus
// back to the control that opened it. Closed it holds nothing, so the planet's code (PlaceView's lazy MiniSpace, the engine and its
// textures) is asked only once the sheet is open. "Its page" swaps the sheet's content for the place's page, with a way back: one modal.
import type { ComponentProps, MouseEvent } from "react";
import { useRef } from "react";
import { Button, Dialog } from "@gnoworld/ui";
import { Info } from "./Info.tsx";
import styles from "./PhoneInfo.module.css";
import { PageButton, PlacePage } from "./PlaceSheet.tsx";

type InfoProps = ComponentProps<typeof Info>;

// A # link inside the sheet: to a place in the sheet it scrolls there, with no history entry; to one that is not (#chat, the chat behind
// the sheet) it closes the sheet, which is where it leads. A link to another page is the router's: the new address drops the sheet.
function follow(event: MouseEvent<HTMLElement>, onClose: () => void) {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (link === null || link.target === "_blank") return;
  const href = link.getAttribute("href");
  if (href?.startsWith("#") !== true) return;
  event.preventDefault();
  const target = event.currentTarget.ownerDocument.getElementById(decodeURIComponent(href.slice(1)));
  if (target !== null && event.currentTarget.contains(target)) target.scrollIntoView({ block: "start" });
  else onClose();
}

export function PhoneInfo({
  open,
  paged,
  onPage,
  onClose,
  place,
  panelRef,
  ...info
}: Omit<InfoProps, "buttons" | "close" | "page" | "panelRef"> &
  Partial<Pick<InfoProps, "panelRef">> & {
    open: boolean;
    /** The page shows in place of the info (the address's, phoneSheet.ts). */
    paged: boolean;
    onPage: (paged: boolean) => void;
    onClose: () => void;
  }) {
  const ownRef = useRef<HTMLElement>(null);
  // The info draws its own kicker and name; the page, which the route gave neither, gets them in the title. Close and Escape go back to
  // the info first.
  return (
    <Dialog
      title={paged ? place.name : "Info"}
      {...(paged ? { kicker: place.kicker } : {})}
      wide="screen"
      open={open}
      onClose={
        paged
          ? () => {
              onPage(false);
            }
          : onClose
      }
    >
      {open ? (
        <div
          className={styles["sheet"]}
          onClick={(event) => {
            follow(event, onClose);
          }}
        >
          {paged ? (
            <>
              <span className={styles["back"]}>
                <Button
                  emphasis="quiet"
                  icon="arrow"
                  onClick={() => {
                    onPage(false);
                  }}
                >
                  Back to Info
                </Button>
              </span>
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
                      onPage(true);
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
