// The room's Media as a dialog: each line of the room's window holding a link to an accepted service (embeds.ts), newest first,
// with its service, its author and its time, the link leaving in a new tab. What was shared is anyone's words: drawn as text.
import { inlines, markdown, type Line } from "@gnoworld/core";
import { Dialog, Stack } from "@gnoworld/ui";
import { embedOf } from "./embeds.ts";
import { roomLabel } from "./names.ts";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./SavedView.module.css";

const CLOCK = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// The line's first link to an accepted service, and the service's name.
function mediaOf(line: Line): { href: string; service: string } | undefined {
  for (const node of inlines(markdown(line.text))) {
    if (node.type !== "link") continue;
    const player = embedOf(node.href);
    if (player !== undefined) return { href: node.href, service: player.service };
  }
  return undefined;
}

export interface MediaViewProps {
  room: string;
  lines: readonly Line[];
  open: boolean;
  onClose: () => void;
}

export function MediaView({ room, lines, open, onClose }: MediaViewProps) {
  const found = lines.toReversed().flatMap((line) => {
    const media = mediaOf(line);
    return media === undefined ? [] : [{ line, ...media }];
  });
  return (
    <Dialog
      title={`Media in ${roomLabel(room)}`}
      description="What the room's recent messages shared, by link."
      open={open}
      onClose={onClose}
    >
      {found.length === 0 ? (
        <p>Nothing shared here yet. A YouTube, Vimeo or Giphy link in a message shows here.</p>
      ) : (
        <Stack as="ul" space="xs">
          {found.map(({ line, href, service }) => (
            <li key={line.id} className={[shared["card"], styles["line"]].join(" ")}>
              <Stack space="3xs">
                <span className={styles["meta"]}>
                  {service} ·{" "}
                  <b>
                    <Person name={line.account ?? line.from} guest={line.account === undefined} />
                  </b>{" "}
                  · <time dateTime={line.time}>{CLOCK.format(new Date(line.time))}</time>
                </span>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {href}
                </a>
              </Stack>
            </li>
          ))}
        </Stack>
      )}
    </Dialog>
  );
}
