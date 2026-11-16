// The info of a place on a phone (under 900 px), where the wide full chat's info column has no room: a sheet over the chat holding that
// same Info (one copy of the panel's logic), opened from the chat's header. Its title and Close are ui's Dialog's, which gives the focus
// back to the control that opened it. Closed it holds nothing; it draws no planet (the place band over the chat holds it).
// "Its page" swaps the sheet's content for the place's page, with a way back: one modal.
import type { ComponentProps, MouseEvent } from "react";
import { useRef } from "react";
import { Dialog, IconButton, PlanetThumb } from "@gnoworld/ui";
import { discOf } from "../../lib/worldDisc.ts";
import { worldOf } from "./PlaceView.tsx";
import { Info } from "./Info.tsx";
import styles from "./PhoneInfo.module.css";
import { PageButton, PlacePage } from "./PlaceSheet.tsx";
import { sectionId } from "./sectionId.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { Credits } from "./Worlds.tsx";

type InfoProps = ComponentProps<typeof Info>;

// A # link inside the sheet: to a place in the sheet it scrolls there, with no history entry; to one that is not (#chat, the chat behind
// the sheet) it closes the sheet, which is where it leads. A link to another page is the router's: the new address drops the sheet.
function follow(event: MouseEvent<HTMLElement>, onClose: () => void) {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (link === null || link.target === "_blank") return;
  const href = link.getAttribute("href");
  if (href?.startsWith("#") !== true) return;
  event.preventDefault();
  const id = sectionId(href);
  const target = id === undefined ? null : event.currentTarget.ownerDocument.getElementById(id);
  if (target !== null && event.currentTarget.contains(target)) target.scrollIntoView({ block: "start" });
  else onClose();
}

// The title row's mark: the place's picture for the info, Back for the page.
function Lead({ place, paged, onBack }: { place: ChatPlace; paged: boolean; onBack: () => void }) {
  return paged ? (
    <span className={styles["back"]}>
      <IconButton icon="arrow" label="Back to Info" emphasis="plain" onClick={onBack} />
    </span>
  ) : (
    <PlanetThumb src={discOf(worldOf(place))} name={place.name} decorative />
  );
}

export function PhoneInfo({
  open,
  paged,
  onPage,
  onClose,
  place,
  panelRef,
  ...info
}: Omit<InfoProps, "buttons" | "close" | "page" | "panelRef" | "planet"> &
  Partial<Pick<InfoProps, "panelRef">> & {
    open: boolean;
    /** The page shows in place of the info (the address's, phoneSheet.ts). */
    paged: boolean;
    onPage: (paged: boolean) => void;
    onClose: () => void;
  }) {
  const ownRef = useRef<HTMLElement>(null);
  // One heading for both: the place's kicker and name in the title row, with its picture at the start for the info and Back for the page
  // (so Back costs no row of its own). Close and Escape go back to the info first.
  return (
    <Dialog
      title={place.name}
      kicker={place.kicker}
      lead={
        <Lead
          place={place}
          paged={paged}
          onBack={() => {
            onPage(false);
          }}
        />
      }
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
            <PlacePage place={place} />
          ) : (
            <>
              <Info
                {...info}
                place={place}
                panelRef={panelRef ?? ownRef}
                buttons={null}
                close={null}
                planet={false}
                bare
                page={
                  <div className={styles["page"]}>
                    <PageButton
                      primary
                      onOpen={() => {
                        onPage(true);
                      }}
                    />
                  </div>
                }
              />
              <Credits className={styles["credits"]} />
            </>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
