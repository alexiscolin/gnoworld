// The first signals' chunk (slice 9h), loaded by Arrival.tsx: a logged-in account opening a world asks the server to chart it,
// and the server's signal on the page's one stream (D215) is the only thing that shows a banner, to the account it names, for
// a day after its time (D213); never the call's answer. The banners are the design system's flash in its arrival look, one at
// a time (DESIGN-SYSTEM.md, Flash); Share copies the world's address and says what came of it.
import type { Signal } from "@gnoworld/schemas";
import { Flash, type FlashMessage } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { pageSignalsApi, type signalsApi } from "../../lib/api/signals.ts";
import { canCopy, copyAddress } from "../../lib/copy.ts";
import { useApp } from "../../storeContext.tsx";
import { useFirst } from "./ChartedBy.tsx";

// How long a banner stays after the signal that made it: the label's day, the server's to say (the record carries its time).
const DAY = 24 * 60 * 60_000;
type Kind = Signal["kind"];

const WORDS = {
  chart: (name: string) => ({ title: `First to chart · ${name}`, line: "Your name stays on it" }),
  words: (name: string) => ({ title: `First words in ${name}`, line: "Your name shows on its label for a day" }),
} as const;

interface Props {
  /** The world's slug, and its name as the page draws it. */
  world: string;
  name: string;
  /** The address Share copies: the world's page. */
  address: string;
  api?: Pick<ReturnType<typeof signalsApi>, "chart">;
  now?: () => number;
}

// A rejection here is a bug, not a state (the calls answer in words or a Result): the browser's own report, read only then.
const report = (error: unknown): void => {
  reportError(error);
};

export function Arrived({ world, name, address, api, now = Date.now }: Props) {
  const [client] = useState(() => api ?? pageSignalsApi());
  const me = useApp(({ login }) => (login.session.kind === "in" ? login.session.address : undefined));
  const firsts = { chart: useFirst(world, "chart"), words: useFirst(world, "words") };
  // The answer is not read, so no banner comes from it, and a refusal (the rate, a network failure) leaves the page as it is;
  // the call answers with a Result, so only a fault of the code rejects, and is reported as the page reports one.
  useEffect(() => {
    if (me !== undefined) client.chart(world).then(() => undefined, report);
  }, [client, me, world]);
  const earned = (["chart", "words"] as const).filter((kind) => {
    const signal = firsts[kind];
    return me !== undefined && signal?.account === me && now() - Date.parse(signal.at) < DAY;
  });
  return earned.length === 0 ? null : <Banners key={world} kinds={earned} name={name} address={address} />;
}

function Banners({ kinds, name, address }: { kinds: readonly Kind[]; name: string; address: string }) {
  // Drawn only in the browser, after hydration, so it asks the clipboard at once, as Share.tsx does once hydrated.
  const copying = canCopy();
  const [closed, setClosed] = useState<readonly Kind[]>([]);
  const [said, setSaid] = useState<FlashMessage | null>(null);
  const kind = kinds.find((each) => !closed.includes(each));
  const share = () => {
    copyAddress(address).then((title) => {
      setSaid({ title });
    }, report);
  };
  const banner = (shown: Kind): FlashMessage => ({
    ...WORDS[shown](name),
    ...(copying ? { action: { label: "Share", onAction: share } } : {}),
  });
  return (
    <Flash
      banner
      message={said ?? (kind === undefined ? null : banner(kind))}
      onClose={() => {
        if (said !== null) setSaid(null);
        else if (kind !== undefined) setClosed([...closed, kind]);
      }}
    />
  );
}
