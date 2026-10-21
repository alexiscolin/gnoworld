import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "../Button/IconButton.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { surface } from "../Popover/floating.ts";
import styles from "./Dialog.module.css";

export interface DialogProps {
  title: string;
  open: boolean;
  /** Asked to close, by Esc or Close: the page sets open to false. */
  onClose: () => void;
  /** 760 px, for the palette, the lightbox and the passport; 460 otherwise. */
  wide?: boolean;
  children: ReactNode;
}

// A field: never an input drawn as a button.
const FIELD =
  "input:not([type='submit'], [type='image'], [type='button'], [type='reset'], [type='hidden']), select, textarea";

/** The native modal dialog, over its scrim: its first field the browser can focus takes the focus, or
 * its title, never a button; Esc and Close ask the page to close it, and the browser gives the focus
 * back to the opener. */
export function Dialog({ title, open, onClose, wide = false, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
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
        <Cluster justify="between" space="s">
          <h2 ref={headingRef} id={titleId} tabIndex={-1}>
            {title}
          </h2>
          <IconButton
            icon="close"
            label="Close"
            emphasis="plain"
            onClick={() => {
              onClose();
            }}
          />
        </Cluster>
        {children}
      </Stack>
    </dialog>
  );
}
