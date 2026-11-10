// The Earth's "Latest on X" (frame 40, the proposal's cardLatest): the newest post the team copied by hand into xPosts.json (8i), as a card
// of the plate: its handle, its words, when, and its address on X; a row written as an example is tagged "sample". The time is a clock time,
// never an age (F3066). None, no card.
import { Button, Card, Chip, Stack } from "@gnoworld/ui";
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
    <Card look="hub" rises>
      <Card.Header
        icon="news"
        title="Latest on X"
        level={2}
        actions={"sample" in latest && latest.sample ? <Chip tone="warm">sample</Chip> : undefined}
      />
      <Card.Body>
        <Stack space="xs">
          <b>{latest.handle}</b>
          <p>{latest.text}</p>
          <time className="meta" dateTime={latest.at}>
            {stampOf(latest.at, now)}
          </time>
          <div>
            <Button emphasis="quiet" size="s" icon="arrow-up-right" href={latest.link}>
              Open on X
            </Button>
          </div>
        </Stack>
      </Card.Body>
    </Card>
  );
}
