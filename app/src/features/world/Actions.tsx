// A world's actions (frames 26 and 92): the main one, then Share. Follow is never drawn: it needs an account's store, which
// does not exist. Share is drawn only where the browser can copy the page's address, so none on the server; the build's page
// has none, and hydration adds it. No dead button.
import { Button, Cluster } from "@gnoworld/ui";
import { useEffect, useState, useSyncExternalStore } from "react";

// How long the answer to a click stays, in milliseconds.
const SAID_FOR = 2_500;

const unchanging = () => () => undefined;
// A browser may have no clipboard at all, or one with no `writeText` (a page that is not secure): it is not typed as absent.
const clipboard = (): Clipboard | undefined => navigator.clipboard;
const canCopy = () => typeof clipboard()?.writeText === "function";
const cannotKnow = () => false;

// The link goes to the chat; the focus follows it to the composer, so the reader can type at once (F2864). The composer is the
// chat's own textarea: the jump to a fragment would blur it, so when there is one the click stops there. With none (the rooms have
// not loaded, or a guest reads), the link keeps its jump.
const focusComposer = (event: MouseEvent) => {
  if (!(event.target instanceof Element) || !event.target.closest("[href='#chat']")) return;
  const composer = document.querySelector<HTMLElement>("#chat textarea");
  if (composer === null) return;
  event.preventDefault();
  composer.focus();
};

export function Actions({ address }: { address: string }) {
  // false in the pre-render and while hydrating, then what the browser says: the same words are drawn first.
  const copying = useSyncExternalStore(unchanging, canCopy, cannotKnow);
  // An object, so each answer is a new value: the timer starts again with each click, even when the words are the same.
  const [said, setSaid] = useState<{ words: string } | null>(null);
  useEffect(() => {
    if (said === null) return;
    const timer = setTimeout(() => {
      setSaid(null);
    }, SAID_FOR);
    return () => {
      clearTimeout(timer);
    };
  }, [said]);
  // The focus follows the link to the chat's composer (F2864).
  useEffect(() => {
    document.addEventListener("click", focusComposer);
    return () => {
      document.removeEventListener("click", focusComposer);
    };
  }, []);
  return (
    <Cluster space="2xs">
      {/* The world's chat sits on the page: the one thing to do here is to say hi in it. */}
      <Button href="#chat" emphasis="solid" size="l" icon="arrow">
        Say hi in the chat
      </Button>
      {copying ? (
        <Button
          size="l"
          onClick={() => {
            navigator.clipboard.writeText(address).then(
              () => {
                setSaid({ words: "Copied" });
              },
              () => {
                setSaid({ words: "Could not copy the address" });
              },
            );
          }}
        >
          Share
        </Button>
      ) : null}
      <span role="status" className="label">
        {said?.words}
      </span>
    </Cluster>
  );
}
