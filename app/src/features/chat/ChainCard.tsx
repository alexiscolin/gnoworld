// A call the chain told, as a card of a room's thread (frames 20 to 35): who called what, on which realm, at which block, in words from the
// event alone, drawn as text and never before its event (ADR-0002 §4). The schema stopped hostile text at the stream; this is the second
// wall: names are capped and stripped of control and bidi characters.
import { Card } from "@gnoworld/ui";
import type { ChainCall } from "../../store/chain.ts";
import styles from "./ChainCard.module.css";

// Text and nothing else: format characters (bidi overrides among them) and controls out, 64 characters at most.
const plain = (text: string): string => text.replace(/[\p{Cf}\p{Cc}]/gu, "").slice(0, 64);
// An address by its two ends: never the whole of it, which a reader could take for a name.
const short = (address: string): string => {
  const text = plain(address);
  return text.length <= 12 ? text : `${text.slice(0, 6)}…${text.slice(-4)}`;
};

/** One call, an item of the thread's list: a dashed card with its link icon, the realm in the data's mono. */
export function ChainCard({ call }: { call: ChainCall }) {
  return (
    <li data-chain="">
      <Card dashed compact>
        <Card.Header icon="link" level={3} title={`${short(call.actor)} called ${plain(call.func)}`} />
        <p className={styles["meta"]}>
          on chain, <span className={styles["realm"]}>{plain(call.realm).replace("gno.land/", "")}</span> · block{" "}
          {call.height}
        </p>
      </Card>
    </li>
  );
}
