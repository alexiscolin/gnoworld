// A poll's line drawn as the video's frames 73 and 76 draw it: the question, a bar an answer filled to its share, the share at
// its end, the reader's own answer edged, then the count of votes. A vote is a reaction (core's poll.ts): an account taps an
// answer to vote, another to move its vote, its own to take it back; a guest reads the bars.
import { POLL_KEYS, revote, type Poll, type Reacting } from "@gnoworld/core";
import { Stack } from "@gnoworld/ui";
import styles from "./PollView.module.css";

export interface PollViewProps {
  /** The poll line's msgid. */
  to: string;
  poll: Poll;
  /** Its votes as votesString writes them: a string the line compares by value, as its chips. */
  votes: string;
  /** Reacts, or takes a reaction back; none for a guest. */
  react: ((reaction: Reacting) => boolean) | undefined;
}

/** A poll's votes as one string: the counts, then the reader's answer after a slash, empty for none. */
export const votesString = ({ counts, mine }: { counts: readonly number[]; mine: number | undefined }): string =>
  `${counts.join(",")}/${mine === undefined ? "" : String(mine)}`;

function votesOf(votes: string, answers: number) {
  const [counts = "", mine = ""] = votes.split("/");
  const read = counts.split(",").map((count) => Number.parseInt(count, 10) || 0);
  return {
    counts: Array.from({ length: answers }, (_, at) => read[at] ?? 0),
    mine: mine === "" ? undefined : Number.parseInt(mine, 10),
  };
}

// A bar's fill through the CSSOM, which the page's style-src allows where a style attribute is refused.
const filled = (part: number) => (element: HTMLElement | null) => {
  element?.style.setProperty("--_share", `${String(part)}%`);
};

const share = (count: number, total: number) => (total === 0 ? 0 : Math.round((count / total) * 100));

export function PollView({ to, poll, votes, react }: PollViewProps) {
  const { counts, mine } = votesOf(votes, poll.answers.length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  return (
    <div role="group" aria-label={`Poll: ${poll.question}`}>
      <Stack space="2xs">
        <p>{poll.question}</p>
        <Stack as="ul" space="2xs">
          {poll.answers.map((answer, at) => {
            const part = share(counts[at] ?? 0, total);
            const face = (
              <>
                <span className={styles["fill"]} ref={filled(part)} aria-hidden="true" />
                <span className={styles["answer"]}>{answer}</span>
                <span className={styles["share"]}>{`${String(part)}%`}</span>
              </>
            );
            return (
              <li key={POLL_KEYS[at]}>
                {react === undefined ? (
                  <span className={styles["bar"]}>{face}</span>
                ) : (
                  <button
                    type="button"
                    className={styles["bar"]}
                    aria-pressed={mine === at}
                    aria-label={`${answer}, ${String(part)}%, ${String(counts[at] ?? 0)} votes`}
                    onClick={() => {
                      for (const { emoji, on } of revote({ mine }, at)) react({ to, emoji, on });
                    }}
                  >
                    {face}
                  </button>
                )}
              </li>
            );
          })}
        </Stack>
        <p className="label">
          {`${String(total)} ${total === 1 ? "vote" : "votes"}`}
          {react === undefined ? null : " · Tap to vote"}
        </p>
      </Stack>
    </div>
  );
}
