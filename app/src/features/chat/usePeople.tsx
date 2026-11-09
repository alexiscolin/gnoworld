// What Who's here does in the chat (ChatScreen's): the info panel's focus, or in a narrow chat a dialog.
import { Dialog } from "@gnoworld/ui";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { onAsked } from "../../pageAsks.ts";
import { useLocation } from "react-router";

/** What Who's here does: where the chat has an info panel it takes the reader to the people in it, closing the thread that
 * holds its place; in a narrow chat, which has no panel, it opens them in a dialog, which an address change closes. Their
 * list is the caller's (`people`). */
export function usePeople({
  screenRef,
  people,
  compact,
  present,
  closeThread,
}: {
  screenRef: RefObject<HTMLElement | null>;
  people: ReactNode;
  compact: boolean;
  present: number | undefined;
  closeThread: (() => void) | undefined;
}) {
  const panelRef = useRef<HTMLElement>(null);
  // Open at an address: a move to another closes it, as the room behind it changes.
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  const ask = () => {
    if (compact) {
      setOpened(key);
      return;
    }
    closeThread?.();
    // After the thread's panel is gone and the line has had the focus back, which the people take from it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    });
  };
  // The rooms' column's "+" by its direct messages asks for the people (pageAsks.ts), which this chat answers.
  useEffect(() => {
    const stop = new AbortController();
    onAsked("who-is-here", ask, stop.signal);
    return () => {
      stop.abort();
    };
  });
  return {
    panel: panelRef,
    ask,
    dialog: compact ? (
      <Dialog
        title="Who's here"
        {...(present === undefined ? {} : { description: `${String(present)} here now` })}
        open={opened === key}
        onClose={() => {
          setOpened(undefined);
        }}
      >
        {/* A person chosen opens a conversation, whose field the browser cannot focus while this modal holds the page: it takes
            the focus once the dialog has closed (U12). */}
        <div
          onClick={(event) => {
            if (!(event.target instanceof Element) || event.target.closest("button") === null) return;
            setOpened(undefined);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                screenRef.current?.querySelector<HTMLElement>('[data-region="conversation"] textarea')?.focus();
              });
            });
          }}
        >
          {opened === key ? people : null}
        </div>
      </Dialog>
    ) : null,
  };
}
