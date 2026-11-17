// A place on a phone (under 900 px), where the wide full chat's info column has no room: one sheet over the chat, opened from the band. It holds
// the place's page (its plate: live chip, description, actions, stats, charts) and, at its foot, what the Info panel holds (the live line,
// who is here, the links out, the credits: one copy of the panel's logic); a place with no page shows those alone. Its title and close are
// ui's Dialog's, which gives the focus back to the control that opened it; a swipe down on the title row closes it too (phoneSheet.ts).
import type { ComponentProps, MouseEvent } from "react";
import { useRef } from "react";
import { Dialog } from "@gnoworld/ui";
import { Info } from "./Info.tsx";
import styles from "./PhoneInfo.module.css";
import { PlacePage } from "./PlaceSheet.tsx";
import { usePlacePage } from "./placePage.ts";
import { useSwipeClose } from "./phoneSheet.ts";
import { sectionId } from "./sectionId.ts";
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

export function PhoneInfo({
  open,
  onClose,
  place,
  panelRef,
  ...info
}: Omit<InfoProps, "buttons" | "close" | "page" | "panelRef" | "planet"> &
  Partial<Pick<InfoProps, "panelRef">> & {
    open: boolean;
    onClose: () => void;
  }) {
  const ownRef = useRef<HTMLElement>(null);
  const plate = usePlacePage();
  const page = plate !== null && plate !== undefined;
  return (
    <div {...useSwipeClose(onClose)} className={styles["swipe"]}>
      <Dialog
        title={place.name}
        kicker={place.kicker}
        closeLabel="Back to the chat"
        wide="screen"
        open={open}
        onClose={onClose}
      >
        {open ? (
          <div
            data-sheet=""
            className={styles["sheet"]}
            onClick={(event) => {
              follow(event, onClose);
            }}
          >
            {page ? <PlacePage place={place} onClose={onClose} /> : null}
            <Info
              {...info}
              place={page ? { ...place, description: "" } : place}
              panelRef={panelRef ?? ownRef}
              buttons={null}
              close={null}
              planet={false}
              bare
            />
            <Credits className={styles["credits"]} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
