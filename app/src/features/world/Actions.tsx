// A place's actions (frames 26, 86, 93): the main one, then Follow and Share as the video draws them. Follow and Share act on this device
// alone: never in the page the build writes (no dead button), and their code comes a moment after the first screen, out of its budget.
import { Button, Cluster } from "@gnoworld/ui";
import { lazy, Suspense, useEffect } from "react";
import { useAfterLoad } from "../../later.ts";
import type { SharedPlace } from "../share/index.ts";

// As the arrival's pill waits (passport/Later.tsx): past the first screen's measure.
const SETTLED_MS = 1000;
const PlateActs = lazy(async () => ({ default: (await import("./PlateActs.tsx")).PlateActs }));

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

// A path of this site, made of plain segments and nothing else: a value from a world's data is untrusted, so a scheme, a host,
// a backslash, a space, a control character, a dot segment, a query or a fragment is no link (the browser reads `/\\host` and
// `/<tab>/host` as another host).
const isSitePath = (path: string): boolean => /^(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)+$/.test(path);

export interface ActionsProps {
  /** The place, as a share names and links it. */
  place: SharedPlace;
  /** The place as the device keys what it follows ("universe:world"). */
  follow: string;
  /** The world's proposals' page, which then leads. */
  proposals?: string;
  /** The main action's words, "Say hi in the chat" unless the place names its room. */
  say?: string;
}

export function Actions({ place, follow, proposals, say = "Say hi in the chat" }: ActionsProps) {
  const reading = proposals !== undefined && isSitePath(proposals);
  const settled = useAfterLoad(SETTLED_MS);
  // The focus follows the link to the chat's composer (F2864).
  useEffect(() => {
    document.addEventListener("click", focusComposer);
    return () => {
      document.removeEventListener("click", focusComposer);
    };
  }, []);
  return (
    <Cluster space="2xs">
      {/* A world with a proposals realm leads with reading them (frames 22 and 27); the chat stays one click away. */}
      {reading ? (
        <Button href={proposals} emphasis="solid" size="l" icon="arrow">
          Read the proposals
        </Button>
      ) : null}
      {/* The world's chat sits on the page: the one thing to do here is to say hi in it, unless the proposals lead. */}
      <Button href="#chat" emphasis={reading ? "outline" : "solid"} size="l" icon="arrow">
        {say}
      </Button>
      {settled ? (
        <Suspense fallback={null}>
          <PlateActs place={place} follow={follow} />
        </Suspense>
      ) : null}
    </Cluster>
  );
}
