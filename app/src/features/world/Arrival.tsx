// The arrival banners (frames 90 to 97, coherence.md): "First to chart" and "First words", at the top of a world's plate, shown to
// the person who earned them and only from the server's signal, which the page's one stream hands to the store (D215): never
// from the chart call's own answer, never from a page load, never to a guest or to another account. A banner ends a day after
// its signal's time (D213). Mounted by the world's page as one element; it also asks who is first, for the plate (FirstCharted).
import { Card, Kicker, Stack } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { pageSignalsApi, type signalsApi } from "../../lib/api/signals.ts";
import { own } from "../../store/record.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { Share } from "./Share.tsx";

// How long a banner stays after the signal that made it: the label's day, the server's to say (the record carries its time).
const DAY = 24 * 60 * 60_000;
// The calls answer with a Result and never reject: nothing to do on either side of them.
const nothing = (): void => undefined;

interface Props {
  /** The world's slug, and its name as the page draws it. */
  world: string;
  name: string;
  /** The address Share copies: the world's page. */
  address: string;
  api?: Pick<ReturnType<typeof signalsApi>, "chart" | "firsts">;
  now?: () => number;
}

export function Arrival({ world, name, address, api, now = Date.now }: Props) {
  const store = useAppStore();
  const [client] = useState(() => api ?? pageSignalsApi());
  const me = useApp(({ login }) => (login.session.kind === "in" ? login.session.address : undefined));
  const arrival = useApp(({ signals }) => own(signals.arrivals, world));
  // Who is first, for the plate: anyone's read, kept in the store beside what the stream tells.
  useEffect(() => {
    let live = true;
    void client.firsts(world).then((answer) => {
      if (live && answer.ok) store.getState().signalActions.firstsRead(answer.value);
    }, nothing);
    return () => {
      live = false;
    };
  }, [client, store, world]);
  // A logged-in account opens the world: the server says who was first, by the stream; the answer is not read, so no banner
  // comes from it, and a refusal (the rate, a network failure) leaves the page as it is.
  useEffect(() => {
    if (me !== undefined) void client.chart(world).then(nothing, nothing);
  }, [client, me, world]);
  const heard = (["chart", "words"] as const).flatMap((kind) => {
    const signal = arrival?.[kind];
    return me !== undefined && signal?.account === me && now() - Date.parse(signal.at) < DAY ? [kind] : [];
  });
  if (heard.length === 0) return null;
  return (
    <Stack space="xs">
      {heard.map((kind) => (
        <Card key={kind} compact>
          <Card.Header level={2} title={kind === "chart" ? `First to chart · ${name}` : `First words in ${name}`} />
          <Card.Body>
            <Kicker>{kind === "chart" ? "Your name stays on it" : "Your name shows on its label for a day"}</Kicker>
          </Card.Body>
          <Card.Actions>
            <Share address={address} size="m" />
          </Card.Actions>
        </Card>
      ))}
    </Stack>
  );
}
