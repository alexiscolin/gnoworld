// The Earth's "LATEST ON X" (frame 40): the newest post the team copied by hand into xPosts.json (8i), its handle, its words, when, and its
// address on X; a row written as an example says "Sample", as the frame does. The time is a clock time, never an age (F3066). None, no card.
import { Card, Icon, Kicker, Stack } from "@gnoworld/ui";
import posts from "../../../data/xPosts.json" with { type: "json" };
import { useClock } from "./clock.ts";
import { stampOf } from "./stamp.ts";

export function LatestOnX() {
  const now = useClock();
  const latest = posts.reduce<(typeof posts)[number] | undefined>(
    (newest, post) => (newest === undefined || post.at > newest.at ? post : newest),
    undefined,
  );
  if (latest === undefined) return null;
  return (
    <Stack space="2xs">
      <Kicker dot="world">Latest on X</Kicker>
      <Card compact>
        <Card.Header title={latest.handle} level={2} />
        <Card.Body>
          <p>{latest.text}</p>
          <a className="label nowrap" href={latest.link} target="_blank" rel="noopener noreferrer">
            <time dateTime={latest.at}>{stampOf(latest.at, now)}</time>
            {"sample" in latest && latest.sample ? " · Sample" : null} <Icon name="arrow-up-right" />
          </a>
        </Card.Body>
      </Card>
    </Stack>
  );
}
