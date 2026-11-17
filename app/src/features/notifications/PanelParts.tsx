// The bell panel's parts (frames 86, 87): its head, the worlds to filter by, and a line, its mark mint while unread.
import { Button, Chip, Cluster, Icon, IconButton, Row } from "@gnoworld/ui";
import { whenOf, type Item } from "./feed.ts";
import { hrefProp } from "../chat/index.ts";
import styles from "./Panel.module.css";

// The panel's head: its title and the way to mark everything read; on a phone, where the panel covers the screen and the bell with it, Close.
export function Head({ onMarkAll, onClose }: { onMarkAll: () => void; onClose: () => void }) {
  return (
    <Cluster justify="between" space="s">
      <h2 className={styles["title"]}>Notifications</h2>
      <Cluster space="2xs" className={styles["actions"]}>
        <span className={styles["markAllBox"]}>
          <Button emphasis="link" size="s" onClick={onMarkAll}>
            <span className={`label ${String(styles["markAll"])}`}>Mark all read</span>
          </Button>
        </span>
        <span className={styles["close"]}>
          <IconButton icon="close" label="Close" emphasis="plain" onClick={onClose} />
        </span>
      </Cluster>
    </Cluster>
  );
}

// The worlds the lines belong to, to show one alone; none when no line has a world.
export function WorldChips({
  worlds,
  shown,
  name,
  onShow,
}: {
  worlds: readonly string[];
  shown: string | undefined;
  name: (slug: string) => string;
  onShow: (slug: string | undefined) => void;
}) {
  if (worlds.length === 0) return null;
  return (
    <div role="group" aria-label="Worlds">
      <Cluster space="2xs">
        <Chip
          selected={shown === undefined}
          onClick={() => {
            onShow(undefined);
          }}
        >
          All worlds
        </Chip>
        {worlds.map((slug) => (
          <Chip
            key={slug}
            selected={shown === slug}
            onClick={() => {
              onShow(slug);
            }}
          >
            {name(slug)}
          </Chip>
        ))}
      </Cluster>
    </div>
  );
}

// One line: its mark, its words and where, and when.
export function Line({
  item,
  now,
  unread,
  onOpen,
}: {
  item: Item;
  now: number;
  unread: boolean;
  onOpen: (item: Item) => void;
}) {
  const lead = (
    <span className={styles["mark"]} data-unread={unread || undefined}>
      <Icon name={item.icon} />
    </span>
  );
  const when = <span className="label">{whenOf(item.at, now)}</span>;
  // A line off the site opens the warning from its own button; one of the site is a link, read as it is followed.
  return item.external === true ? (
    <li>
      <Row
        look="divided"
        title={item.text}
        subtitle={item.where}
        subtitleLook="label"
        lead={lead}
        trail={
          <Cluster space="2xs">
            {when}
            <IconButton
              icon="arrow-up-right"
              size="s"
              emphasis="plain"
              label={`Open: ${item.text}`}
              onClick={() => {
                onOpen(item);
              }}
            />
          </Cluster>
        }
      />
    </li>
  ) : (
    <li
      onClickCapture={() => {
        onOpen(item);
      }}
    >
      <Row
        look="divided"
        title={item.text}
        subtitle={item.where}
        subtitleLook="label"
        lead={lead}
        trail={when}
        {...hrefProp(item.href)}
      />
    </li>
  );
}
