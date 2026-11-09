// The header's bell (frames 86, 87; 8a's slot): the button and its count on the first screen, the rest later. The count and the
// reminders come a moment after the page has loaded (Watch.tsx); the panel at the first press (Panel.tsx). Neither is in the first
// screen's budget, nor later.ts: on the home, the one page that has it nowhere else, it would cost a chunk of its own (472 B).
import { IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState } from "react";
import { useApp } from "../../storeContext.tsx";

const SETTLED_MS = 1000;
const Watch = lazy(async () => (await import("./door.ts")).watch());
const Panel = lazy(async () => (await import("./door.ts")).panel());

// True a moment after the page has loaded.
function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = () => {
      timer = setTimeout(setSettled, SETTLED_MS, true);
    };
    if (document.readyState === "complete") wait();
    else addEventListener("load", wait, { once: true });
    return () => {
      removeEventListener("load", wait);
      clearTimeout(timer);
    };
  }, []);
  return settled;
}

export function Bell() {
  const [count, setCount] = useState(0);
  // The bell counts what is the reader's own: a visitor's bell holds the news, uncounted (the plan space-simple).
  const signedIn = useApp(({ login }) => login.session.kind === "in");
  const settled = useSettled();
  const [open, setOpen] = useState(false);
  // The panel stays in the page while it leaves, a moment after `open` went false.
  const [mounted, setMounted] = useState(false);
  return (
    <span data-bell="">
      <IconButton
        icon="bell"
        label="Notifications"
        count={signedIn ? count : 0}
        countTone="new"
        pressed={open}
        onClick={() => {
          setOpen(!open);
          if (!open) setMounted(true);
        }}
      />
      <Suspense fallback={null}>
        {settled ? <Watch onCount={setCount} /> : null}
        {mounted ? (
          <Panel
            open={open}
            onClose={() => {
              setOpen(false);
            }}
            onGone={() => {
              setMounted(false);
            }}
          />
        ) : null}
      </Suspense>
    </span>
  );
}
