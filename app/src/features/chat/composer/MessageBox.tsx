// The composer's one rounded box (the design.58.01): the format bar, the field, and at its foot the quick actions' /, the
// field's words, when it has some to say, and Send. Its grid places what the field draws itself, so its words sit in the foot's row.
import { Cluster, IconButton, type IconName } from "@gnoworld/ui";
import { Fragment, useState, type ReactNode } from "react";
import shared from "../../../edge.module.css";
import type { Format } from "./kinds.ts";
import { useFull } from "../dock/fullState.ts";
import { useKeepFocus } from "../dock/useKeepFocus.ts";
import styles from "./MessageBox.module.css";

// The format bar's groups, a rule between each (the marks, the code, the lists), the marks as the design orders
// them: B, I, U, S. Underline goes as `++`.
const BAR: readonly (readonly { format: Format | "link"; icon: IconName; label: string }[])[] = [
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

type LinkTool = (size: "xs" | "s") => ReactNode;

// The format bar: each format of BAR, named, applied to the box's selection.
function FormatBar({
  onFormat,
  linkTool,
  open,
}: {
  onFormat: (format: Format) => void;
  linkTool: LinkTool | undefined;
  open: boolean;
}) {
  // Larger in the full chat, the screen its own.
  const tools = useFull() ? "s" : "xs";
  return (
    <div role="group" aria-label="Format" className={styles["format"]} data-open={open ? "" : undefined}>
      <Cluster space="3xs">
        {BAR.map((group, at) => (
          <Fragment key={group[0]?.format}>
            {at === 0 ? null : (
              <span
                role="separator"
                aria-orientation="vertical"
                className={styles["rule"]}
                data-drops={at === BAR.length - 1 ? "" : undefined}
              />
            )}
            {group.map((tool) => {
              const { format } = tool;
              if (format === "link") return <Fragment key="link">{linkTool?.(tools)}</Fragment>;
              return (
                <IconButton
                  key={format}
                  icon={tool.icon}
                  label={tool.label}
                  size={tools}
                  emphasis="plain"
                  tool
                  drops={at === BAR.length - 1}
                  onClick={() => {
                    onFormat(format);
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </Cluster>
    </div>
  );
}

// The design's one rounded box: the format bar, the field (its children), and at its foot the room's quick actions, the field's words
// (the field draws them, the box's grid places them) and Send. No @ nor / of its own: both are typed, and Tab completes them.
export function MessageBox({
  onFormat,
  linkTool,
  send,
  goes,
  quick,
  children,
}: {
  /** The format bar's tools; none, no bar: a guest's line is one plain line. */
  onFormat?: ((format: Format) => void) | undefined;
  /** The bar's link tool, which is the composer's (a popover that asks for the address): it brings its own code. */
  linkTool?: LinkTool | undefined;
  send: string;
  goes: boolean;
  /** The room's quick actions, behind a / at the foot's start; none in a thread's box. */
  quick?: ReactNode;
  children: ReactNode;
}) {
  // A phone folds the bar behind one control (MessageBox.module.css): its nine tools at 44 px fill two rows of a short screen.
  const [folded, setFolded] = useState(false);
  const keep = useKeepFocus();
  return (
    <div
      role="group"
      aria-label="Message box"
      className={[shared["edge"], styles["box"]].join(" ")}
      // A press on the box's own buttons keeps the field focused: a phone folds the shell header while it is, and Send would move
      // from under the finger at the blur, before the click. Also keeps the on-screen keyboard up after a send.
      {...keep}
    >
      {onFormat === undefined ? null : <FormatBar onFormat={onFormat} linkTool={linkTool} open={folded} />}
      <div className={styles["field"]}>{children}</div>
      {quick === undefined && onFormat === undefined ? null : (
        <div className={styles["acts"]}>
          {quick}
          {onFormat === undefined ? null : (
            <span className={styles["fold"]}>
              <IconButton
                icon="bold"
                label="Formatting"
                size="s"
                emphasis="plain"
                expanded={folded}
                onClick={() => {
                  setFolded(!folded);
                }}
              />
            </span>
          )}
        </div>
      )}
      <span className={styles["send"]}>
        <IconButton solid type="submit" size="s" icon="arrow" label={send} disabled={!goes} />
      </span>
    </div>
  );
}
