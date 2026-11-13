// The room's pins above its lines: each pin one line, its author and its words cut to the line, the first three at once, a
// "+N" opening the rest; the bar is never taller than three lines (the rest scrolls inside it). For a reader who may pin,
// an Unpin of each. PinStack is the drawing; PinBar holds whether the rest is open and says in a flash why an unpin did not happen.
import type { PinnedLine } from "@gnoworld/schemas";
import { Button, Flash, Icon, IconButton, type FlashMessage } from "@gnoworld/ui";
import { useState } from "react";
import type { Done } from "./askPins.ts";
import { shortAddress } from "./names.ts";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./PinBar.module.css";
import { pinProblem } from "./problem.ts";

/** Pins shown before the "+N". */
const SHOWN = 3;

export interface PinStackProps {
  /** The room's pins, the newest pinned first. */
  pins: readonly PinnedLine[];
  /** Whether the reader may pin here: then each pin has its Unpin. */
  may: boolean;
  open: boolean;
  onToggle: () => void;
  onUnpin: (id: string) => void;
}

/** The pin bar as drawn: nothing for no pin; the first three pins a line each; with more, a "+N" that opens the rest in the same
 * three lines' height, and "Hide" to shut them. */
export function PinStack({ pins, may, open, onToggle, onUnpin }: PinStackProps) {
  if (pins.length === 0) return null;
  const rows = open ? pins : pins.slice(0, SHOWN);
  const more = pins.length - SHOWN;
  return (
    <section aria-label="Pinned messages" className={styles["bar"]}>
      <ul className={[shared["plain"], styles["pins"]].join(" ")}>
        {rows.map((pin) => (
          <li key={pin.id} className={styles["pin"]}>
            <Icon name="pin" />
            <span className="truncate" title={pin.text}>
              <b className={styles["who"]}>
                <Person name={pin.account} guest={false} />
              </b>{" "}
              {pin.text}
            </span>
            {may ? (
              <IconButton
                icon="close"
                label={`Unpin ${shortAddress(pin.account)}'s message`}
                size="xs"
                emphasis="plain"
                onClick={() => {
                  onUnpin(pin.id);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <Button size="s" emphasis="quiet" expanded={open} onClick={onToggle}>
          {open ? "Hide" : `+${String(more)}`}
        </Button>
      ) : null}
    </section>
  );
}

export interface PinBarProps {
  pins: readonly PinnedLine[];
  may: boolean;
  /** Unpins a line; whether the server took it. */
  onUnpin: (id: string) => Promise<Done>;
}

/** The room's pin bar, shut at first. */
export function PinBar({ pins, may, onUnpin }: PinBarProps) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<FlashMessage | null>(null);
  return (
    <>
      <PinStack
        pins={pins}
        may={may}
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
        onUnpin={(id) => {
          onUnpin(id).then(
            (done) => {
              if (!done.ok) setSaid(pinProblem(done.reason, "unpin"));
            },
            () => {
              setSaid(pinProblem("network", "unpin"));
            },
          );
        }}
      />
      <Flash
        message={said}
        onClose={() => {
          setSaid(null);
        }}
      />
    </>
  );
}
