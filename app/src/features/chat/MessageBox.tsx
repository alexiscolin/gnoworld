// The composer's one rounded box (the video's frame 23.58.01): the format bar, the field, and at its foot the quick actions' +, the
// field's words, when it has some to say, and Send. Its grid places what the field draws itself, so its words sit in the foot's row.
import { Cluster, Icon, IconButton, type IconName } from "@gnoworld/ui";
import { Fragment, type ReactNode } from "react";
import shared from "../../edge.module.css";
import type { Format } from "./format.ts";
import { useFull } from "./full.ts";
import styles from "./MessageBox.module.css";

// The format bar's groups, a rule between each (frame 66: the marks, the code, the lists), the marks as frame 73 orders
// them: B, I, U, S. Underline goes as `++` (8k).
const BAR: readonly (readonly { format: Format; icon: IconName; label: string }[])[] = [
  [
    { format: "bold", icon: "bold", label: "Bold" },
    { format: "italic", icon: "italic", label: "Italic" },
    { format: "underline", icon: "underline", label: "Underline" },
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
  // Larger in the full chat, the screen its own (Alexis, 2026-11-07).
  const tools = useFull() ? "s" : "xs";
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
                size={tools}
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

// The video's one rounded box: the format bar, the field (its children), and at its foot the room's quick actions, the field's words
// (the field draws them, the box's grid places them) and Send. No @ nor / of its own: both are typed, and Tab completes them (Alexis, 2026-11-08).
export function MessageBox({
  onFormat,
  send,
  goes,
  quick,
  children,
}: {
  /** The format bar's tools; none, no bar: a guest's line is one plain line (D430). */
  onFormat?: ((format: Format) => void) | undefined;
  send: string;
  goes: boolean;
  /** The room's quick actions, behind a + at the foot's start; none in a thread's box. */
  quick?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label="Message box" className={[shared["edge"], styles["box"]].join(" ")}>
      {onFormat === undefined ? null : <FormatBar onFormat={onFormat} />}
      <div className={styles["field"]}>{children}</div>
      {quick === undefined ? null : <div className={styles["acts"]}>{quick}</div>}
      <button type="submit" className={`grid-center disc ${String(styles["send"])}`} disabled={!goes}>
        <Icon name="arrow" />
        <span className="visually-hidden">{send}</span>
      </button>
    </div>
  );
}
