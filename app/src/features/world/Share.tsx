// Share (frames 26, 90 and 92): copies the page's address and says so, drawn where the world's actions and the arrival banners
// have it. Drawn only where the browser can copy, so none on the server; the build's page has none, and hydration adds it. No
// dead button. The answer to a click stays a moment, in words: that it was copied, or that it could not be.
import { Button, type ButtonProps } from "@gnoworld/ui";
import { useEffect, useState, useSyncExternalStore } from "react";

// How long the answer to a click stays, in milliseconds.
const SAID_FOR = 2_500;

const unchanging = () => () => undefined;
// A browser may have no clipboard at all, or one with no `writeText` (a page that is not secure): it is not typed as absent.
const clipboard = (): Clipboard | undefined => navigator.clipboard;
const canCopy = () => typeof clipboard()?.writeText === "function";
const cannotKnow = () => false;

export function Share({ address, size = "l" }: { address: string; size?: ButtonProps["size"] }) {
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
  return (
    <>
      {copying ? (
        <Button
          size={size}
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
    </>
  );
}
