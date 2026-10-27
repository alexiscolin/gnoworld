// A line's copy, from its bar (slice 4's 4c): its text or the room's link to the clipboard, said in the room's flash.
import type { Line } from "@gnoworld/core";
import type { FlashMessage } from "@gnoworld/ui";
import { useState } from "react";
import { roomHref } from "./names.ts";

// What a copy says, in the room's flash: done, or not, a page with no clipboard (a plain http origin) included.
export function useCopy(room: string) {
  const [said, setSaid] = useState<FlashMessage | null>(null);
  const copy = (line: Line, what: "text" | "link") => {
    setSaid(null);
    const text = what === "text" ? line.text : new URL(roomHref(room), location.href).href;
    // A page with no clipboard throws at once: inside a then, it fails as a refusal does.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => {
          setSaid({ title: what === "text" ? "Text copied." : "Link copied." });
        },
        () => {
          setSaid({ title: "Could not copy." });
        },
      );
  };
  return { said, setSaid, copy };
}
