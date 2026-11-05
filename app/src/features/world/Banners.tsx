// The first signals' chunk (slice 9h), loaded by Arrival.tsx: a logged-in account opening a world asks the server to chart it,
// and the server's signal on the page's one stream (D215) is the only thing that shows a banner, to the account it names, for
// a day after its time (D213); never the call's answer. The banners are the design system's flash in its arrival look, one at
// a time (DESIGN-SYSTEM.md, Flash); Share copies the world's address and says what came of it. The plate names who charted.
import type { Signal } from "@gnoworld/schemas";
import { Flash, type FlashMessage } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { pageSignalsApi, type signalsApi } from "../../lib/api/signals.ts";
import { useApp } from "../../storeContext.tsx";
import { shortAddress } from "../chat/index.ts";

// How long a banner stays after the signal that made it: the label's day, the server's to say (the record carries its time).
const DAY = 24 * 60 * 60_000;
// The call answers with a Result and never rejects: nothing to do on either side of it.
const nothing = (): void => undefined;
type Kind = Signal["kind"];
// A browser may have no clipboard at all: it is not typed as absent.
const clipboard = (): Clipboard | undefined => navigator.clipboard;

const WORDS = {
  chart: (name: string) => ({ title: `First to chart · ${name}`, line: "Your name stays on it" }),
  words: (name: string) => ({ title: `First words in ${name}`, line: "Your name shows on its label for a day" }),
} as const;

/** The world's first of a kind, as the stream told it. */
const useFirst = (world: string, kind: Kind) =>
  useApp(({ signals }) => signals.find((signal) => signal.world === world && signal.kind === kind));

interface Props {
  /** The world's slug, and its name as the page draws it. */
  world: string;
  name: string;
  /** The address Share copies: the world's page. */
  address: string;
  api?: Pick<ReturnType<typeof signalsApi>, "chart">;
  now?: () => number;
}

export function Arrived({ world, name, address, api, now = Date.now }: Props) {
  const [client] = useState(() => api ?? pageSignalsApi());
  const me = useApp(({ login }) => (login.session.kind === "in" ? login.session.address : undefined));
  const firsts = { chart: useFirst(world, "chart"), words: useFirst(world, "words") };
  // The answer is not read, so no banner comes from it, and a refusal (the rate, a network failure) leaves the page as it is.
  useEffect(() => {
    if (me !== undefined) void client.chart(world).then(nothing, nothing);
  }, [client, me, world]);
  const earned = (["chart", "words"] as const).filter((kind) => {
    const signal = firsts[kind];
    return me !== undefined && signal?.account === me && now() - Date.parse(signal.at) < DAY;
  });
  return earned.length === 0 ? null : <Banners key={world} kinds={earned} name={name} address={address} />;
}

function Banners({ kinds, name, address }: { kinds: readonly Kind[]; name: string; address: string }) {
  // Drawn only in the browser, after hydration, so it reads the clipboard at once, as Share.tsx does once hydrated; a browser
  // may have none, or one without `writeText` (a page that is not secure), and gets no dead Share.
  const copying = typeof clipboard()?.writeText === "function";
  const [closed, setClosed] = useState<readonly Kind[]>([]);
  const [said, setSaid] = useState<FlashMessage | null>(null);
  const kind = kinds.find((each) => !closed.includes(each));
  const share = () => {
    navigator.clipboard.writeText(address).then(
      () => {
        setSaid({ title: "Copied" });
      },
      () => {
        setSaid({ title: "Could not copy the address" });
      },
    );
  };
  const banner = (shown: Kind): FlashMessage => ({
    ...WORDS[shown](name),
    ...(copying ? { action: { label: "Share", onAction: share } } : {}),
  });
  return (
    <Flash
      look="arrival"
      message={said ?? (kind === undefined ? null : banner(kind))}
      onClose={() => {
        if (said !== null) setSaid(null);
        else if (kind !== undefined) setClosed([...closed, kind]);
      }}
    />
  );
}

/** The plate's "First charted by @name" (frame 91): plain text of the short address until slice 9f's names (D212). */
export function ChartedBy({ world }: { world: string }) {
  const charted = useFirst(world, "chart");
  return charted === undefined ? null : <span>First charted by @{shortAddress(charted.account)}</span>;
}
