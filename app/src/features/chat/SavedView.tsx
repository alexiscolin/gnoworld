// The saved messages' list (slice 4's 4d; ADR-0002's "Saved messages: Device"), a dialog over the page: each saved line
// with its author, its room and its words, a way back to the room and a way to remove it, and a word that they are
// kept on this device alone. What was saved is anyone's words: drawn as text, never as markup.
import { Button, Cluster, Dialog, IconButton, Stack } from "@gnoworld/ui";
import type { SavedLine } from "../../lib/keep/keep.ts";
import { roomHref, roomLabel, shortAddress } from "./names.ts";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./SavedView.module.css";

export interface SavedViewProps {
  /** The lines saved, the newest saved first. */
  saved: readonly SavedLine[];
  open: boolean;
  onClose: () => void;
  onRemove: (room: string, id: string) => void;
  /** Whether the device did not keep what was saved. */
  notKept?: boolean;
}

export function SavedView({ saved, open, onClose, onRemove, notKept = false }: SavedViewProps) {
  return (
    <Dialog title="Saved messages" description="Saved on this device only." open={open} onClose={onClose}>
      {notKept ? <p role="status">This device could not keep your saved messages.</p> : null}
      {saved.length === 0 ? (
        <p>Nothing saved yet. Open More on a message, then Save message.</p>
      ) : (
        <Stack as="ul" space="xs">
          {saved.map((line) => {
            const name = line.account ?? line.from;
            return (
              <li key={`${line.room} ${line.id}`} className={[shared["card"], styles["line"]].join(" ")}>
                <Stack space="3xs">
                  <span className={styles["meta"]}>
                    <b>
                      <Person name={name} guest={line.account === undefined} />
                    </b>{" "}
                    in {roomLabel(line.room)}
                  </span>
                  <span>{line.text}</span>
                  <Cluster space="2xs" justify="end">
                    <Button href={roomHref(line.room)} emphasis="quiet" size="s">
                      Open in room
                    </Button>
                    <IconButton
                      icon="close"
                      label={`Remove ${line.account === undefined ? line.from : shortAddress(line.account)}'s saved message`}
                      size="s"
                      emphasis="plain"
                      onClick={() => {
                        onRemove(line.room, line.id);
                      }}
                    />
                  </Cluster>
                </Stack>
              </li>
            );
          })}
        </Stack>
      )}
    </Dialog>
  );
}
