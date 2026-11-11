// What the preview shows of a room and of a person: the room's topic, its people, its lines and its last three, then the way in; a
// person's face and where they are, then the message.
import { foldEdits, markdown } from "@gnoworld/core";
import { Button, Kicker } from "@gnoworld/ui";
import { lazy, Suspense } from "react";
import { useApp } from "../../storeContext.tsx";
import { drawing, whoIs } from "../chat/index.ts";
import { PlaceThumb } from "./PlaceResults.tsx";
import styles from "./SearchDialog.module.css";
import type { SearchItem } from "./types.ts";

// A line as the chat reads it, marks and links drawn: the chat's drawing, a chunk asked when a preview shows a line. A message of
// more than a paragraph shows as its text.
const LineText = lazy(async () => {
  const { reader, inlines } = await drawing();
  return {
    default: ({ text }: { text: string }) => {
      const [first] = markdown(text);
      return (
        <span>{first?.type === "paragraph" ? inlines(first.children, { ...reader, tabbable: false }) : text}</span>
      );
    },
  };
});

const LAST = 3;

// The last lines the page holds of the room that the moderation passed: a line it hid, or has not yet checked, is not shown here.
function Last({ room }: { room: string }) {
  const lines = useApp((app) => app.chat.rooms[room]?.lines);
  const verdicts = useApp((app) => app.verdicts[room]);
  const shown = foldEdits(lines ?? []).shown.filter(
    (line) => line.kind === "message" && verdicts?.[line.id] === "checked",
  );
  if (shown.length === 0) return null;
  return (
    <div className={styles["lines"]}>
      {shown.slice(-LAST).map((line) => (
        <span key={line.id} className={styles["line"]}>
          <b>{whoIs(line.account ?? line.from)}</b>{" "}
          <Suspense fallback={line.text}>
            <LineText text={line.text} />
          </Suspense>
        </span>
      ))}
    </div>
  );
}

export function RoomPreview({ item, go }: { item: SearchItem; go: (item: SearchItem) => void }) {
  return (
    <section className={["rule-start", styles["preview"]].join(" ")} aria-label="Preview">
      <Kicker>{`Room · ${item.place ?? ""}`}</Kicker>
      <h3 className={styles["title"]}>{`#${item.name}`}</h3>
      {item.topic === undefined ? null : <p className={styles["description"]}>{item.topic}</p>}
      <p className={styles["stats"]}>
        {item.here === undefined ? null : (
          <span>
            <span className={styles["here"]}>{item.here}</span> here now
          </span>
        )}
        {item.messages === undefined ? null : <span>{item.messages} messages in 24 h</span>}
      </p>
      <Last room={`#${item.name}`} />
      <Button
        emphasis="solid"
        icon="arrow"
        keys="Enter"
        onClick={() => {
          go(item);
        }}
      >
        Open the room
      </Button>
    </section>
  );
}

export function PersonPreview({ item, go }: { item: SearchItem; go: (item: SearchItem) => void }) {
  return (
    <section className={["rule-start", styles["preview"]].join(" ")} aria-label="Preview">
      <PlaceThumb item={item} size="l" />
      <Kicker>Person</Kicker>
      <h3 className={styles["title"]}>{item.name}</h3>
      {item.description === undefined ? null : <p className={styles["description"]}>{item.description}</p>}
      <Button
        emphasis="solid"
        icon={item.message === true ? "chat" : "arrow"}
        keys="Enter"
        onClick={() => {
          go(item);
        }}
      >
        {item.message === true ? "Message" : "Open the room"}
      </Button>
    </section>
  );
}
