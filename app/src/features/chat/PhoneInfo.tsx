// The info of a place on a phone (under 900 px), where the wide full chat's info column has no room: a sheet over the chat holding that
// same Info (one copy of the panel's logic), opened from the chat's header. Its title and Close are ui's Dialog's, which gives the focus
// back to the control that opened it. Closed it holds nothing, so the planet's code (PlaceView's lazy MiniSpace, the engine and its
// textures) is asked only once the sheet is open.
import type { ComponentProps } from "react";
import { useRef } from "react";
import { Dialog } from "@gnoworld/ui";
import { Info } from "./Info.tsx";
import styles from "./PhoneInfo.module.css";
import { PlaceSheet } from "./PlaceSheet.tsx";

type InfoProps = ComponentProps<typeof Info>;

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
  return (
    <Dialog title="Info" kicker={place.kicker} open={open} onClose={onClose}>
      {open ? (
        // A link followed to another page leaves the sheet, as the rooms' drawer does; one opening a new tab leaves it open.
        <div
          className={styles["sheet"]}
          onClick={(event) => {
            const link = event.target instanceof Element ? event.target.closest("a") : null;
            if (link !== null && link.target !== "_blank") onClose();
          }}
        >
          <Info
            {...info}
            place={place}
            panelRef={panelRef ?? ownRef}
            buttons={null}
            close={null}
            page={
              <div className={styles["page"]}>
                <PlaceSheet place={place} />
              </div>
            }
          />
        </div>
      ) : null}
    </Dialog>
  );
}
