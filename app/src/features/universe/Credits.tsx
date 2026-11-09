// The attributions (docs/DESIGN-SYSTEM.md, Credits): one word wherever textures show, and the full credits a press away, which CC BY 4.0
// §3(a)(2) allows. In the universe's chunk: a page with no space pays nothing for it.
import { lazy, Suspense, useState } from "react";
import styles from "./Universe.module.css";

// The dialog's code is asked at the first press, as the full chat's is: one chunk of its own that neither page carries.
const CreditsDialog = lazy(async () => ({ default: (await import("../credits/index.ts")).CreditsDialog }));

export function Credits() {
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles["credits"]}
        onClick={() => {
          setAsked(true);
          setOpen(true);
        }}
      >
        Credits
      </button>
      {asked ? (
        <Suspense fallback={null}>
          <CreditsDialog
            open={open}
            onClose={() => {
              setOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
