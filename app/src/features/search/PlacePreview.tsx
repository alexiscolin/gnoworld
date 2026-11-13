// The chosen place's preview at the palette's end: its portrait, kind, people now, description, rooms and actions.
import { Button, Chip, Cluster, Kicker } from "@gnoworld/ui";
import { PersonPreview, RoomPreview } from "./KindPreview.tsx";
import { PlaceThumb } from "./PlaceResults.tsx";
import styles from "./SearchDialog.module.css";
import type { SearchItem, SearchKind } from "./types.ts";

const KINDS: Record<SearchKind, string> = {
  ecosystem: "Ecosystem",
  world: "World",
  earth: "Home",
  cosmos: "Universe",
  station: "Station",
  system: "System",
  realm: "Realm",
  command: "Command",
  room: "Room",
  person: "Person",
  messages: "Messages",
};

const kicker = ({ kind, tag, here }: SearchItem) =>
  [KINDS[kind], tag, (here ?? 0) > 0 ? `${String(here)} here now` : undefined]
    .filter((part) => part !== undefined)
    .join(" · ");

export function PlacePreview({
  item,
  copySaid,
  go,
  chat,
  copy,
}: {
  item: SearchItem;
  /** What the last copy came to, for a moment: "Copied", or that it could not. */
  copySaid: string | undefined;
  go: (item: SearchItem) => void;
  chat: (item: SearchItem) => void;
  copy: (item: SearchItem) => void;
}) {
  if (item.kind === "room") return <RoomPreview item={item} go={go} />;
  if (item.kind === "person") return <PersonPreview item={item} go={go} />;
  return (
    <section className={["rule-start", styles["preview"]].join(" ")} aria-label="Preview">
      <PlaceThumb item={item} size="l" />
      <Kicker>{kicker(item)}</Kicker>
      <h3 className={styles["title"]}>{item.name}</h3>
      {item.description === undefined ? null : <p className={styles["description"]}>{item.description}</p>}
      <Cluster space="2xs">
        {(item.rooms ?? []).map((room) => (
          <Chip key={room}>{room}</Chip>
        ))}
      </Cluster>
      <Cluster space="2xs">
        <Button
          emphasis="solid"
          icon="arrow"
          keys="Enter"
          onClick={() => {
            go(item);
          }}
        >
          Go
        </Button>
        {item.kind === "command" ? null : (
          <>
            <Button
              icon="chat"
              keys="Shift+Enter"
              onClick={() => {
                chat(item);
              }}
            >
              Chat
            </Button>
            <Button
              emphasis="quiet"
              icon="link"
              onClick={() => {
                copy(item);
              }}
            >
              {copySaid ?? "Copy link"}
            </Button>
          </>
        )}
      </Cluster>
    </section>
  );
}
