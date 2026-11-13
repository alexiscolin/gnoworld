// Where a read came from and when (5k): the source's host and its time, on every fact and every failure, so the page never shows
// a number without its source and age. A failed read is a state with its next step (our sentence, never the answer's words).
import { hostOf, type Failure, type Source } from "@gnoworld/chain/read";

/** The age of a read as it is shown: the minute it was asked, in UTC, as the time element's text. */
const askedAt = (at: string): string => `${at.slice(0, 16).replace("T", " ")} UTC`;

/** `Read from <host> at <time>`. */
export function ReadSource({ source }: { source: Source }) {
  return (
    <p className={"meta"}>
      Read from <span dir="ltr">{hostOf(source.url)}</span> at <time dateTime={source.at}>{askedAt(source.at)}</time>
    </p>
  );
}

/** A failed read: what the reader may do now, and where it was asked. A read the page stands without is a `status`, not an alert. */
export function ReadFailed({
  failure,
  source,
  role = "alert",
}: {
  failure: Failure;
  source: Source;
  role?: "alert" | "status";
}) {
  return (
    <div role={role}>
      <p>{failure.next}</p>
      <ReadSource source={source} />
    </div>
  );
}
