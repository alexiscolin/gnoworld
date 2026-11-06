import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
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
  /** A drawer at the screen's start, its full height, over the page with no scrim, its title for assistive technology alone and Close at
   * its top end (the search, frames 98 to 100); a click beside it closes it. */
  side?: "start";
  children: ReactNode;
}

// A field: never an input drawn as a button; an editable box too.
const FIELD =
  "input:not([type='submit'], [type='image'], [type='button'], [type='reset'], [type='hidden']), select, textarea, [contenteditable]:not([contenteditable='false'])";

// A drawer: a press on the page beside it (the backdrop's, which the dialog receives) asks to close it.
const closedBeside =
  (onClose: () => void) =>
  ({ target, currentTarget, clientX: x, clientY: y }: MouseEvent<HTMLDialogElement>) => {
    if (target !== currentTarget) return;
    const { left, right, top, bottom } = currentTarget.getBoundingClientRect();
    if (x < left || x > right || y < top || y > bottom) onClose();
  };

interface TitleRowProps extends Pick<DialogProps, "title" | "onClose"> {
  side: DialogProps["side"] | undefined;
  headingRef: RefObject<HTMLHeadingElement | null>;
  id: string;
  hideClose: boolean;
}

// The title wraps its own words beside Close, which keeps the row's end at any width (U6). A drawer's title is for assistive technology alone.
function TitleRow({ headingRef, id, title, hideClose, onClose, side }: TitleRowProps) {
  return (
    <Sidebar side="end" space="s">
      <h2 ref={headingRef} id={id} tabIndex={-1} className={side === undefined ? undefined : "visually-hidden"}>
        {title}
      </h2>
      {hideClose ? null : (
        <div className={styles["close"]}>
          <IconButton
            icon="close"
            label="Close"
            emphasis={side === undefined ? "plain" : "outline"}
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
// A field hidden by CSS or disabled refuses the focus: the next one is tried (F367); none takes it, the heading does.
function focusFirst(shown: HTMLElement, heading: HTMLElement | null) {
  const focused = [...shown.querySelectorAll<HTMLElement>(FIELD)].some((field) => {
    field.focus();
    return document.activeElement === field;
  });
  if (!focused) heading?.focus();
}

// The kicker over the title row, in the one label style.
function Heading({ kicker, kickerId, ...row }: TitleRowProps & { kicker: string | undefined; kickerId: string }) {
  return (
    <Stack space="xs">
      {kicker === undefined || kicker === "" ? null : (
        <div id={kickerId} className={styles["kicker"]}>
          <Kicker>{kicker}</Kicker>
        </div>
      )}
      <TitleRow {...row} />
    </Stack>
  );
}

export function Dialog({
  title,
  open,
  onClose,
  wide = false,
  kicker,
  hideClose,
  description,
  side,
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
    focusFirst(shown, headingRef.current);
  }, [open, closes]);
  return (
    <dialog
      ref={dialogRef}
      className={surface(styles["dialog"])}
      data-width={wide ? "wide" : "standard"}
      data-side={side}
      aria-labelledby={titleId}
      aria-describedby={describedBy || undefined}
      // Esc would close it in the browser: the page is asked instead, and keeps it open if it chooses.
      // A cancel from a control inside it (a file picker dismissed) is that control's (F332).
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClick={side === undefined ? undefined : closedBeside(onClose)}
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
        <Heading
          kicker={kicker}
          kickerId={kickerId}
          headingRef={headingRef}
          id={titleId}
          title={title}
          hideClose={hideClose === true}
          onClose={onClose}
          side={side}
        />
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
