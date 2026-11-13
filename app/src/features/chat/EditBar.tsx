// The composer's edit bar (slice 4's 4d, the DM bar): over the field, that a message is being corrected, and a way to
// drop the correction; Escape in the box drops it too, as the reply bar's does, and Save sends it.
import { IconButton, Sidebar } from "@gnoworld/ui";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { FIELD } from "./composerBox.ts";
import rules from "./markdownRules.module.css";
import styles from "./RoomView.module.css";

interface EditingProps {
  /** A message of the reader's is being corrected: its words are the draft. */
  editing?: boolean | undefined;
  onCancelEdit?: (() => void) | undefined;
}

/** What the composer does while a reply is asked (ReplyBar.tsx): the bar over the field, what describes it, the form's keys. */
interface Otherwise {
  bar: ReactNode;
  describedBy: string | undefined;
  keys: (event: KeyboardEvent<HTMLFormElement>) => void;
}

/** The bar (the reply's, when nothing is edited), what describes the field by it, the form's keys, which Escape in the
 * box turns into a dropped edit, and what Send reads: Save. */
export function useEditing(
  { editing = false, onCancelEdit }: EditingProps,
  box: () => Element | undefined,
  otherwise: Otherwise,
): Otherwise & { send: string } {
  const id = useId();
  return {
    bar: editing ? (
      <Sidebar side="end" space="2xs">
        <p id={id} className={[styles["replying"], rules["quote"]].join(" ")}>
          Editing a message
        </p>
        <IconButton
          icon="close"
          label="Cancel the edit"
          size="s"
          emphasis="plain"
          onClick={(event) => {
            const form = event.currentTarget.closest("form");
            onCancelEdit?.();
            form?.querySelector<HTMLElement>(FIELD)?.focus();
          }}
        />
      </Sidebar>
    ) : (
      otherwise.bar
    ),
    send: editing ? "Save" : "Send",
    describedBy: editing ? id : otherwise.describedBy,
    keys: (event) => {
      if (event.key === "Escape" && editing && event.target === box()) onCancelEdit?.();
      else otherwise.keys(event);
    },
  };
}
