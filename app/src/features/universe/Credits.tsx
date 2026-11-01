// The attributions (docs/DESIGN-SYSTEM.md, Credits): one word wherever textures show, and the full credits a press away, which CC BY 4.0
// §3(a)(2) allows. In the universe's chunk: a page with no space pays nothing for it.
import { Dialog, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { CREDITS } from "../../scene/planet/credits.ts";
import styles from "./Universe.module.css";

export function Credits() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles["credits"]}
        onClick={() => {
          setOpen(true);
        }}
      >
        Credits
      </button>
      <Dialog
        title="Credits"
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Stack as="ul">
          {CREDITS.map(({ line, source, read }) => (
            <li key={line}>
              <Stack space="3xs">
                <p>{line}</p>
                <p>
                  <a href={source} target="_blank" rel="noopener noreferrer">
                    {new URL(source).host}
                  </a>{" "}
                  · read on {read}
                </p>
              </Stack>
            </li>
          ))}
        </Stack>
      </Dialog>
    </>
  );
}
