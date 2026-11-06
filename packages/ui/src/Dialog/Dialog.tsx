import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { IconButton } from "../Button/IconButton.tsx";
import { Sidebar, Stack } from "../compositions/index.ts";
import { ids } from "../ids.ts";
import { Kicker } from "../Kicker/Kicker.tsx";
import { surface } from "../Popover/floating.ts";
import styles from "./Dialog.module.css";

export interface DialogProps {
  title: string;
  open: boolean;
  /** Asked to close, by Esc or Close: the page sets open to false. */
  onClose: () => void;
  /** 760 px, for the palette, the lightbox and the passport; 460 otherwise. */
  wide?: boolean;
  /** The line above the title, in the one label style, read with the description. */
  kicker?: string;
  /** No Close button, where the page draws another way out; Esc still asks to close. */
  hideClose?: boolean;
  /** What it asks about, muted under the title and read with it by assistive technology. */
  description?: string;
  children: ReactNode;
}

// A field: never an input drawn as a button; an editable box too.
const FIELD =
  "input:not([type='submit'], [type='image'], [type='button'], [type='reset'], [type='hidden']), select, textarea, [contenteditable]:not([contenteditable='false'])";

interface TitleRowProps extends Pick<DialogProps, "title" | "onClose"> {
  headingRef: RefObject<HTMLHeadingElement | null>;
  id: string;
  hideClose: boolean;
}

// The title wraps its own words beside Close, which keeps the row's end at any width (U6).
function TitleRow({ headingRef, id, title, hideClose, onClose }: TitleRowProps) {
  return (
    <Sidebar side="end" space="s">
      <h2 ref={headingRef} id={id} tabIndex={-1}>
        {title}
      </h2>
      {hideClose ? null : (
        <div>
          <IconButton
            icon="close"
            label="Close"
            emphasis="plain"
            onClick={() => {
              onClose();
            }}
          />
        </div>
      )}
    </Sidebar>
  );
}

/** The native modal dialog, over its scrim: its first field the browser can focus takes the focus, or
 * its title, never a button; Esc and Close ask the page to close it, and the browser gives the focus
 * back to the opener. */
export function Dialog({
  title,
  open,
  onClose,
  wide = false,
  kicker,
  hideClose = false,
  description,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const kickerId = useId();
  const kickerShown = kicker !== undefined && kicker !== "";
  const describedBy = ids(kickerShown ? kickerId : undefined, description === undefined ? undefined : descriptionId);
  // Each close the browser made itself: the page is told, and while it keeps the dialog open the
  // dialog shows again (F330).
  const [closes, setCloses] = useState(0);
  // Its own close() fires a close event too, which the browser queues: that one is not the browser's (F361).
  const ownCloseRef = useRef(false);
  useEffect(() => {
    const shown = dialogRef.current;
    if (shown === null || shown.open === open) return;
    if (!open) {
      ownCloseRef.current = true;
      shown.close();
      return;
    }
    shown.showModal();
    // A field hidden by CSS or disabled refuses the focus: the next one is tried (F367).
    const fields = [...shown.querySelectorAll<HTMLElement>(FIELD)];
    const focused = fields.some((field) => {
      field.focus();
      return document.activeElement === field;
    });
    if (!focused) headingRef.current?.focus();
  }, [open, closes]);
  return (
    <dialog
      ref={dialogRef}
      className={surface(styles["dialog"])}
      data-width={wide ? "wide" : "standard"}
      aria-labelledby={titleId}
      aria-describedby={describedBy || undefined}
      // Esc would close it in the browser: the page is asked instead, and keeps it open if it chooses.
      // A cancel from a control inside it (a file picker dismissed) is that control's (F332).
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      // Closed by the browser itself (a second Esc, a form's dialog method), not by the page; a dialog
      // inside it closing is that dialog's (F352).
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        if (ownCloseRef.current) {
          ownCloseRef.current = false;
          return;
        }
        onClose();
        setCloses((count) => count + 1);
      }}
    >
      <Stack space="m">
        <Stack space="xs">
          {kickerShown ? (
            <div id={kickerId} className={styles["kicker"]}>
              <Kicker>{kicker}</Kicker>
            </div>
          ) : null}
          <TitleRow headingRef={headingRef} id={titleId} title={title} hideClose={hideClose} onClose={onClose} />
        </Stack>
        {description === undefined ? null : (
          <p id={descriptionId} className={styles["description"]}>
            {description}
          </p>
        )}
        {children}
      </Stack>
    </dialog>
  );
}
