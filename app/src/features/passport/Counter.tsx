// The header's passport counter as the video draws it (frames 6, 86, 93: "0/18", then "3/19"): the worlds this device stamped in the
// universe out of the worlds the reader's own view lists, the cosmos's count (ADR-0002 §3, the one exception to "never the total"). It opens
// the passport. Before a page has read the count it shows the stamps alone.
import { passportCount, stampedIn } from "@gnoworld/core";
import { Button } from "@gnoworld/ui";
import { useApp } from "../../storeContext.tsx";

export function PassportCounter({
  universe,
  listed,
  onOpen,
}: {
  universe: string;
  /** The worlds the reader's view lists, once a page has read their count: the header asks for none of its own. */
  listed: number | undefined;
  onOpen: () => void;
}) {
  const stamped = useApp(({ device }) => stampedIn(device.stamps, universe).size);
  const count = passportCount(stamped, listed);
  return (
    <Button icon="passport" onClick={onOpen}>
      <span className="visually-hidden">Passport, worlds stamped: </span>
      {count === undefined ? String(stamped) : `${String(count.stamped)}/${String(count.listed)}`}
    </Button>
  );
}
