// The chat's search panel (slice 13, C), in the info panel's place as a thread's is: the field, the filters, the results by day, and the
// states of the canvas's States frame (before typing, nothing found, a conversation that is not searched). A result opens its room at the
// message (the caller's `onOpen`). Public rooms of one world at a time: the server answers for what the reader may read.
import type { SearchHit } from "@gnoworld/schemas";
import { Button, composing, EmptyState, Field, Icon, IconButton, Sidebar, Skeleton, Stack } from "@gnoworld/ui";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { pageRecent } from "../../../lib/keep/recent.ts";
import { parseFind, toQuery, type Time, type Who } from "./filters.ts";
import { Filters } from "./Filters.tsx";
import { moveAmongHits } from "./moving.ts";
import { Results } from "./Results.tsx";
import { Before, Nothing, Trouble, type Search } from "./States.tsx";
import { useChatSearch } from "./useChatSearch.ts";
import styles from "./ChatSearch.module.css";

export interface ChatSearchProps {
  text: string;
  onText: (text: string) => void;
  time: Time;
  onTime: (time: Time) => void;
  /** The world searched, by its slug and its name. */
  world: { slug: string; name: string };
  who: Who;
  /** The room in view, whose label the "in:#room" chip offers. */
  room: string | undefined;
  /** Whether the conversation in view is searched: a direct message or a members room is not. */
  searched: boolean;
  /** The msgid of the message the room is read around, marked in the list. */
  open: string | undefined;
  onOpen: (hit: SearchHit) => void;
  onClose: () => void;
}

const HOUR_MS = 3_600_000;

// The words as they stand a moment after the last key: a search is asked once the typing rests.
function useRested(value: string, ms = 300): string {
  const [rested, setRested] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setRested(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return rested;
}

// The results and the way to more of them.
function Found({ search, open, onOpen }: { search: Search } & Pick<ChatSearchProps, "open" | "onOpen">) {
  return (
    <Stack space="xs">
      <Results pages={search.data?.pages.map((page) => page.hits) ?? []} open={open} onOpen={onOpen} />
      {search.hasNextPage ? (
        <Button
          emphasis="quiet"
          onClick={() => {
            search.fetchNextPage().catch(reportError);
          }}
        >
          {search.isFetchingNextPage ? "Loading…" : "Show more"}
        </Button>
      ) : null}
    </Stack>
  );
}

// What the panel's body shows for the words as they stand.
function Body({
  props,
  ask,
  search,
  answered,
}: {
  props: ChatSearchProps;
  ask: unknown;
  search: Search;
  answered: boolean;
}) {
  const { text, onText, time, onTime, who, room, searched, open, onOpen } = props;
  const hits = search.data?.pages.flatMap((page) => page.hits);
  if (!searched)
    return (
      <EmptyState
        title="This conversation is not searched"
        line="Direct messages and private rooms stay out of gnoworld's index. Your browser's own find (⌘F) still reads what is on screen."
      />
    );
  if (ask === undefined) {
    const { bad } = parseFind(text, who);
    return bad.length > 0 ? (
      <p role="status">{`No one or no room is named ${bad.join(" ")} here.`}</p>
    ) : (
      <Before onText={onText} room={room} me={who.me} />
    );
  }
  if (search.isError) return <Trouble search={search} />;
  if (hits === undefined || !answered) return <Skeleton lines={3} />;
  if (hits.length === 0) return <Nothing text={text} onText={onText} who={who} time={time} onTime={onTime} />;
  return <Found search={search} open={open} onOpen={onOpen} />;
}

// The field, the way out and the filters, with how many were found.
function Head({ props, filtered, page }: { props: ChatSearchProps; filtered: boolean; page: Counted | undefined }) {
  const { text, onText, time, onTime, world, who, searched, onClose } = props;
  return (
    <div className={styles["head"]}>
      <Stack space="xs">
        <Sidebar side="end" align="center" space="2xs">
          {searched ? (
            <Field
              kind="search"
              label={`Search messages in ${world.name}`}
              hideLabel
              placeholder={`Search messages in ${world.name}`}
              value={text}
              onChange={onText}
            />
          ) : (
            <p className="meta">
              <Icon name="lock" /> Search is for public rooms
            </p>
          )}
          <IconButton icon="close" label="Close the search" size="s" emphasis="plain" onClick={onClose} />
        </Sidebar>
        {filtered ? <Filters text={text} onText={onText} time={time} onTime={onTime} who={who} /> : null}
        {page === undefined ? null : (
          <p className="meta">
            <b className={styles["count"]}>{countOf(page)}</b>
            {` in ${world.name}'s public rooms · last 90 days`}
            {page.partial ? ". Only the newest matches were searched; add words to narrow." : ""}
          </p>
        )}
      </Stack>
    </div>
  );
}

// "9 messages"; "1,000+" when the server stopped counting, "at least" when only the newest matches were searched (never the whole's count).
interface Counted {
  total: number;
  capped: boolean;
  partial: boolean;
}
const countOf = (first: Counted | undefined): string | undefined => {
  if (first === undefined || first.total === 0) return undefined;
  const many = first.capped || first.total !== 1;
  const figure = `${first.capped ? "1,000+" : String(first.total)} ${many ? "messages" : "message"}`;
  return first.partial ? `At least ${figure}` : figure;
};

// The words that found something are kept for the next time, on this device alone.
function useRecent(found: boolean, words: string) {
  useEffect(() => {
    if (found) pageRecent().add(words);
  }, [found, words]);
}

export function ChatSearch(props: ChatSearchProps) {
  const { text, onText, time, world, who, searched, onClose } = props;
  const rested = useRested(text);
  const [hour] = useState(() => Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  const ask = searched ? toQuery(rested, { world: world.slug, who, now: new Date(hour), time }) : undefined;
  const search = useChatSearch(ask);
  const found = search.data?.pages.flatMap((page) => page.hits).length ?? 0;
  const first = found === 0 ? undefined : search.data?.pages[0];
  const answered = search.isSuccess && rested === text;
  useRecent(answered && found > 0, rested);
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    (boxRef.current?.querySelector("input") ?? boxRef.current)?.focus();
  }, []);
  // An Escape that ends an input method's composition belongs to the composition.
  const escape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || composing(event.nativeEvent)) return;
    if (event.key !== "Escape") {
      moveAmongHits(event);
      return;
    }
    event.preventDefault();
    // Escape clears the words first, as the palette's does, then closes.
    if (text === "") onClose();
    else onText("");
  };
  return (
    <aside ref={boxRef} tabIndex={-1} aria-label="Search results" className={styles["panel"]} onKeyDown={escape}>
      <Head props={props} filtered={searched && text.trim() !== ""} page={first} />
      <div className={styles["body"]}>
        <Body props={props} ask={ask} search={search} answered={answered} />
      </div>
      <p className={["meta", styles["foot"]].join(" ")}>
        Private rooms and direct messages are not searched. A removed message never shows.
      </p>
    </aside>
  );
}
