// The room's pins above its lines (slice 4's 4d; the prototype's #pinBar): one line, the newest pin and a count, which
// opens into the stack; each pin's author and its words, drawn from Markdown as a line's are (nothing from Ergo reaches
// HTML), and for a reader who may pin, an Unpin of each. PinStack is the drawing; PinBar holds whether it is open and
// says in a flash why an unpin did not happen.
import { markdown } from "@gnoworld/core";
import type { PinnedLine } from "@gnoworld/schemas";
import { Flash, Icon, IconButton, Stack, type FlashMessage } from "@gnoworld/ui";
import { useState } from "react";
import type { Done } from "./askPins.ts";
import { Markdown } from "./Message.tsx";
import { shortAddress } from "./names.ts";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./PinBar.module.css";
import { pinProblem } from "./problem.ts";

export interface PinStackProps {
  /** The room's pins, the newest pinned first. */
  pins: readonly PinnedLine[];
  /** Whether the reader may pin here: then each pin has its Unpin. */
  may: boolean;
  open: boolean;
  onToggle: () => void;
  onUnpin: (id: string) => void;
}

/** The pin bar as drawn: nothing for no pin; the newest pin's author and words cut to one line, with the count of
 * the others, in the button that opens the stack; open, every pin with its author and its words. */
export function PinStack({ pins, may, open, onToggle, onUnpin }: PinStackProps) {
  const [first] = pins;
  if (first === undefined) return null;
  return (
    <section aria-label="Pinned messages" className={styles["bar"]}>
      <button type="button" className={styles["head"]} aria-expanded={open} onClick={onToggle}>
        <Icon name="pin" />
        <span className={styles["newest"]} title={first.text}>
          <b>
            <Person name={first.account} guest={false} />
          </b>{" "}
          {first.text}
        </span>
        {pins.length > 1 ? (
          <small className={styles["count"]}>{open ? "Hide" : `+${String(pins.length - 1)}`}</small>
        ) : null}
      </button>
      {open ? (
        <div className={styles["pins"]}>
          <Stack as="ul" space="2xs">
            {pins.map((pin) => (
              <li key={pin.id} className={[shared["card"], styles["pin"]].join(" ")}>
                <b className={styles["who"]}>
                  <Person name={pin.account} guest={false} />
                </b>{" "}
                <Markdown blocks={markdown(pin.text)} />
                {may ? (
                  <span className={styles["unpin"]}>
                    <IconButton
                      icon="close"
                      label={`Unpin ${shortAddress(pin.account)}'s message`}
                      size="s"
                      emphasis="plain"
                      onClick={() => {
                        onUnpin(pin.id);
                      }}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </Stack>
        </div>
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
