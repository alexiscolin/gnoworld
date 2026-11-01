// The composer's one rounded box (the video's frame 23.58.01): the format bar, the field, and at its foot the marks, the
// field's words and Send. Its grid places what the field draws itself, so its words sit in the foot's row.
import { Cluster, Icon, IconButton, type IconName } from "@gnoworld/ui";
import { Fragment, type ReactNode } from "react";
import type { Format } from "./format.ts";
import styles from "./MessageBox.module.css";

// The format bar's groups, a rule between each (frame 66: the marks, the code, the lists). The video's underline has no
// mark in the text the chat sends, so it is not drawn.
const BAR: readonly (readonly { format: Format; icon: IconName; label: string }[])[] = [
  [
    { format: "bold", icon: "bold", label: "Bold" },
    { format: "italic", icon: "italic", label: "Italic" },
    { format: "strike", icon: "strikethrough", label: "Strikethrough" },
  ],
  [
    { format: "code", icon: "code", label: "Code" },
    { format: "link", icon: "link", label: "Link" },
    { format: "quote", icon: "quote", label: "Quote" },
  ],
  [
    { format: "bulleted", icon: "list-bulleted", label: "Bulleted list" },
    { format: "numbered", icon: "list-numbered", label: "Numbered list" },
  ],
];

// The format bar: each format of BAR, named, applied to the box's selection.
function FormatBar({ onFormat }: { onFormat: (format: Format) => void }) {
  return (
    <div role="group" aria-label="Format" className={styles["format"]}>
      <Cluster space="3xs">
        {BAR.map((group, at) => (
          <Fragment key={group[0]?.format}>
            {at === 0 ? null : <span role="separator" aria-orientation="vertical" className={styles["rule"]} />}
            {group.map((tool) => (
              <IconButton
                key={tool.format}
                icon={tool.icon}
                label={tool.label}
                size="xs"
                emphasis="plain"
                onClick={() => {
                  onFormat(tool.format);
                }}
              />
            ))}
          </Fragment>
        ))}
      </Cluster>
    </div>
  );
}

// The marks the box's foot puts in the draft: @ starts a mention (Tab completes it), / a command.
const MARKS: readonly { mark: string; icon: IconName; label: string }[] = [
  { mark: "@", icon: "at", label: "Mention someone" },
  { mark: "/", icon: "slash", label: "Start a command" },
];

// The video's one rounded box: the format bar, the field (its children), and at its foot the marks, the field's words (the
// field draws them, the box's grid places them) and Send.
export function MessageBox({
  onFormat,
  onInsert,
  send,
  goes,
  children,
}: {
  onFormat: (format: Format) => void;
  onInsert: (mark: string) => void;
  send: string;
  goes: boolean;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label="Message box" className={styles["box"]}>
      <FormatBar onFormat={onFormat} />
      <div className={styles["field"]}>{children}</div>
      <div className={styles["marks"]}>
        {MARKS.map((each) => (
          <IconButton
            key={each.mark}
            icon={each.icon}
            label={each.label}
            size="s"
            emphasis="plain"
            onClick={() => {
              onInsert(each.mark);
            }}
          />
        ))}
      </div>
      <button type="submit" className={styles["send"]} disabled={!goes}>
        <Icon name="arrow" />
        <span className="visually-hidden">{send}</span>
      </button>
    </div>
  );
}
