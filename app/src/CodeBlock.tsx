// A command to copy, read as typed (D13880): the command line's block in settings, and a call card's command, drawn one way: the block
// from the content's start to its end, and under it a row with its help and its Copy, whose end is the block's (the UX pass). What a
// copy came to is its own: the button's words, and a status beside it for a screen reader, as a field has its own.
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import { canCopy, copyText } from "./lib/copy.ts";
import styles from "./CodeBlock.module.css";

// Copy, which says what came of it for this text; it takes the focus as it comes when `focus`.
function Copy({ text, focus }: { text: string; focus: boolean }) {
  const [copied, setCopied] = useState<{ text: string; ok: boolean } | undefined>(undefined);
  const holderRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focus) holderRef.current?.querySelector("button")?.focus();
  }, [focus]);
  const now = copied?.text === text ? copied.ok : undefined;
  return (
    <span className="nowrap" ref={holderRef}>
      <Button
        size="s"
        onClick={() => {
          copyText(text)
            .then((ok) => {
              setCopied({ text, ok });
            })
            .catch(reportError);
        }}
      >
        {now === undefined ? "Copy" : now ? "Copied" : "Not copied"}
      </Button>
      <span role="status" className="visually-hidden">
        {now === undefined ? "" : now ? "Copied" : "Could not copy the block"}
      </span>
    </span>
  );
}

/** `text` in its box, its lines kept and scrolled across; under it `help`, and a Copy. `focus`: Copy takes the focus as the block comes,
 * where the button pressed for it went away or shut (PR #41's UX review). */
export function CodeBlock({ text, help, focus = false }: { text: string; help?: string; focus?: boolean }) {
  return (
    <Stack space="2xs">
      <pre className={[styles["block"], "fill-box", "data-text"].join(" ")} data-scroll="">
        {text}
      </pre>
      <Cluster justify={help === undefined ? "end" : "between"} wrap="no">
        {help === undefined ? null : <p className="meta">{help}</p>}
        {canCopy() ? <Copy text={text} focus={focus} /> : null}
      </Cluster>
    </Stack>
  );
}
