// A command to copy, read as typed (D13880): the command line's block in settings, and a call card's command, drawn one way. What a
// copy came to is its own: the button's words, and a status beside it for a screen reader, as a field has its own.
import { Button, Sidebar } from "@gnoworld/ui";
import { useState } from "react";
import { canCopy, copyText } from "./lib/copy.ts";
import styles from "./CodeBlock.module.css";

/** `text` in its box, its lines kept and scrolled across, with a Copy that says what came of it for this text. */
export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState<{ text: string; ok: boolean } | undefined>(undefined);
  const now = copied?.text === text ? copied.ok : undefined;
  return (
    // The block, then its Copy beside it, never over the text: a one-line command keeps all of its line.
    <Sidebar side="end" space="2xs">
      <pre className={[styles["block"], "fill-box", "data-text"].join(" ")} data-scroll="">
        {text}
      </pre>
      {canCopy() ? (
        <span>
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
      ) : null}
    </Sidebar>
  );
}
