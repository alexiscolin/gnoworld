// A world's actions (frames 26 and 92): the main one, then Share. Follow is never drawn: it needs an account's store, which
// does not exist. Share is drawn only where the browser can copy the page's address, so none on the server; the build's page
// has none, and hydration adds it. No dead button.
import { Button, Cluster } from "@gnoworld/ui";
import { useEffect, useState, useSyncExternalStore } from "react";

type Said = "copied" | "refused" | null;

// How long the answer to a click stays, in milliseconds.
const SAID_FOR = 2_500;

const unchanging = () => () => undefined;
// A browser may have no clipboard at all, or one with no `writeText` (a page that is not secure): it is not typed as absent.
const clipboard = (): Clipboard | undefined => navigator.clipboard;
const canCopy = () => typeof clipboard()?.writeText === "function";
const cannotKnow = () => false;

export function Actions({ address }: { address: string }) {
  // false in the pre-render and while hydrating, then what the browser says: the same words are drawn first.
  const copying = useSyncExternalStore(unchanging, canCopy, cannotKnow);
  const [said, setSaid] = useState<Said>(null);
  useEffect(() => {
    if (said === null) return;
    const timer = setTimeout(() => {
      setSaid(null);
    }, SAID_FOR);
    return () => {
      clearTimeout(timer);
    };
  }, [said]);
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
                setSaid("copied");
              },
              () => {
                setSaid("refused");
              },
            );
          }}
        >
          Share
        </Button>
      ) : null}
      <span role="status" className="label">
        {said === "copied" ? "Copied" : said === "refused" ? "Could not copy the address" : null}
      </span>
    </Cluster>
  );
}
