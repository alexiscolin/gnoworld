// What the chat's search shows apart from results: before typing, and nothing found (the canvas's States frame).
import { shortAddress } from "@gnoworld/schemas";
import { Button, Chip, Cluster, Stack } from "@gnoworld/ui";
import { isUnread } from "../../../lib/query/client.ts";
import { pageRecent } from "../../../lib/keep/recent.ts";
import { roomLabel } from "../names.ts";
import { dropFilter, parseFind } from "./filters.ts";
import type { ChatSearchProps } from "./ChatSearch.tsx";
import type { useChatSearch } from "./useChatSearch.ts";
import styles from "./ChatSearch.module.css";

export type Search = ReturnType<typeof useChatSearch>;

// What the empty field offers: the last searches of this device, and the filters to start from.
export function Before({ onText, room, me }: Pick<ChatSearchProps, "onText" | "room"> & { me: string | undefined }) {
  const recent = pageRecent().get();
  const chips: { label: string; text: string }[] = [
    ...(room === undefined ? [] : [{ label: "in:#room", text: `in:${roomLabel(room)} ` }]),
    ...(me === undefined ? [] : [{ label: "from:@me", text: "from:@me " }]),
    { label: "has:link", text: "has:link " },
  ];
  return (
    <Stack space="s">
      {recent.length === 0 ? null : (
        <Stack space="xs" as="section">
          <h3 className={styles["count"]}>Recent</h3>
          {recent.map((words) => (
            <button
              key={words}
              type="button"
              className={styles["recent"]}
              onClick={() => {
                onText(words);
              }}
            >
              {words}
            </button>
          ))}
        </Stack>
      )}
      <Stack space="xs" as="section">
        <h3 className={styles["count"]}>Narrow it</h3>
        <Cluster space="2xs">
          {chips.map(({ label, text }) => (
            <Chip
              key={label}
              onClick={() => {
                onText(text);
              }}
            >
              {label}
            </Chip>
          ))}
        </Cluster>
      </Stack>
    </Stack>
  );
}

// Nothing found: what was asked, said, and the filters it can do without.
export function Nothing({
  text,
  onText,
  who,
  time,
  onTime,
}: Pick<ChatSearchProps, "text" | "onText" | "who" | "time" | "onTime">) {
  const parsed = parseFind(text, who);
  const drops = (["in", "from", "has"] as const).filter((key) => text.toLowerCase().includes(`${key}:`));
  const said = parsed.words.trim();
  return (
    <Stack space="xs">
      <h3
        className={styles["count"]}
      >{`No message says “${said}”${parsed.from === undefined ? "" : ` from ${shortAddress(parsed.from)}`}`}</h3>
      <p>Rooms keep 90 days. Try other words, or fewer filters.</p>
      <Cluster space="2xs">
        {drops.map((key) => (
          <Button
            key={key}
            emphasis="quiet"
            onClick={() => {
              onText(dropFilter(text, key));
            }}
          >
            {`Remove “${key === "has" ? "link" : key}”`}
          </Button>
        ))}
        {time === "any" ? null : (
          <Button
            emphasis="quiet"
            onClick={() => {
              onTime("any");
            }}
          >
            Any time
          </Button>
        )}
      </Cluster>
    </Stack>
  );
}

// The search's trouble, said: too many asks at once (the next key asks again, a refusal is never retried), or out of reach.
export function Trouble({ search }: { search: Search }) {
  if (isUnread<{ reason?: string }>(search.error) && search.error.read.reason === "too_many")
    return <p role="status">Busy, try again in a moment.</p>;
  return (
    <Stack space="xs">
      <p role="alert">The search is out of reach.</p>
      <Cluster>
        <Button
          emphasis="solid"
          onClick={() => {
            search.refetch().catch(reportError);
          }}
        >
          Try again
        </Button>
      </Cluster>
    </Stack>
  );
}
