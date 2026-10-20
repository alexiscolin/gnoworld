import { useEffect, useId, useRef, type ReactNode } from "react";
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

/** The native modal dialog, over its scrim: its first field takes the focus, or its title, never a
 * button; Esc and Close ask the page to close it, and the browser gives the focus back to the opener. */
export function Dialog({ title, open, onClose, wide = false, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const shown = dialogRef.current;
    if (shown === null || shown.open === open) return;
    if (!open) {
      shown.close();
      return;
    }
    shown.showModal();
    const field = shown.querySelector<HTMLElement>(
      "input:not([type='hidden'], :disabled), select:not(:disabled), textarea:not(:disabled)",
    );
    (field ?? headingRef.current)?.focus();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className={surface(styles["dialog"])}
      data-width={wide ? "wide" : "standard"}
      aria-labelledby={titleId}
      // Esc would close it in the browser: the page is asked instead, and keeps it open if it chooses.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
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
