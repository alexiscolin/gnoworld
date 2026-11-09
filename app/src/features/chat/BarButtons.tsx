// The buttons of a line's bar, one click each (D376): the reactions, and Reply, Open thread and the room's link.
import { IconButton, Menu } from "@gnoworld/ui";
import type { LineActionsProps } from "./LineActions.tsx";

const QUICK = ["👍", "❤️", "😂"];

// The reactions a line's "Add reaction" offers beyond the three on the bar.
const MORE = ["🎉", "🙏", "👀", "🔥", "💯", "😮", "😢", "✅"];

const ASK = { react: "Connect Adena to react.", reply: "Connect Adena to reply." } as const;

export type Need = keyof typeof ASK;

/** What a guest is told where it presses an act that needs an account. */
export const needWords = (need: Need): string => ASK[need];

/** What a guest's bar does at an act that needs an account: says where to connect in the flash; none for an account. */
export const needing = (
  me: string | undefined,
  say: (message: { title: string }) => void,
): LineActionsProps["onNeed"] =>
  me === undefined
    ? (need) => {
        say({ title: needWords(need) });
      }
    : undefined;

// The bar's reactions: the three quick ones, each pressed when the reader gave it and pressed again to take it back, and a menu
// of more. A guest sees them too, and is told where to connect when it presses one.
export function Reacting({
  given,
  onReact,
  onNeed,
}: {
  given: ReadonlySet<string>;
  onReact: LineActionsProps["onReact"];
  onNeed: ((need: Need) => void) | undefined;
}) {
  const toggle = (emoji: string) => {
    if (onNeed === undefined) onReact(emoji, !given.has(emoji));
    else onNeed("react");
  };
  return (
    <>
      {QUICK.map((emoji) => (
        <IconButton
          key={emoji}
          emoji={emoji}
          label={`React with ${emoji}`}
          size="xs"
          emphasis="plain"
          pressed={given.has(emoji)}
          onClick={() => {
            toggle(emoji);
          }}
        />
      ))}
      <Menu
        trigger="Add reaction"
        icon="smile"
        emphasis="plain"
        size="xs"
        label="More reactions"
        items={[...QUICK, ...MORE].map((emoji) => ({
          label: `${given.has(emoji) ? "Take back" : "React with"} ${emoji}`,
          onSelect: () => {
            toggle(emoji);
          },
        }))}
      />
    </>
  );
}

// The bar's other shortcuts, one click each: Reply (a guest is told where to connect), Open thread where the page opens one, and the
// room's link, which a direct message has none of.
export function Shortcuts({
  line,
  dm,
  onCopy,
  onThread,
  onNeed,
  onReply,
}: Pick<LineActionsProps, "line" | "dm" | "onCopy" | "onThread" | "onNeed" | "onReply">) {
  return (
    <>
      <IconButton
        icon="reply"
        label="Reply"
        size="xs"
        emphasis="plain"
        onClick={
          onNeed === undefined
            ? onReply
            : () => {
                onNeed("reply");
              }
        }
      />
      {onThread === undefined ? null : (
        <IconButton
          icon="thread"
          label="Open thread"
          size="xs"
          emphasis="plain"
          onClick={() => {
            onThread(line.id);
          }}
        />
      )}
      {dm === undefined ? (
        <IconButton
          icon="share"
          label="Copy room link"
          size="xs"
          emphasis="plain"
          onClick={() => {
            onCopy("link");
          }}
        />
      ) : null}
    </>
  );
}
