// What a realm page's lists and images are drawn as (D382): lists with lists under their items, tasks as read-only boxes,
// and an image as a card.
import type { Inline, Outline } from "@gnoworld/core";
import { Icon } from "@gnoworld/ui";
import { createElement, type ReactNode } from "react";
import { weigh, type Ink } from "./drawBudget.ts";

// A page's nodes as elements: the chat's drawing, but an image (a link to it, flagged by the reader) is a card, its link
// drawn as any other is, so it passes the same checks and the same warning off gnoweb. One in a mark is a plain link.
export function drawInlines(nodes: readonly Inline[], { via, reader }: Pick<Ink, "via" | "reader">): ReactNode[] {
  return nodes.flatMap((node) => {
    const drawn = via.inlines([node], reader);
    return node.type === "link" && node.image === true
      ? [createElement("span", { "data-image": "", key: undefined }, createElement(Icon, { name: "image" }), ...drawn)]
      : drawn;
  });
}

// A list with lists under its items, or tasks; its items as many as the budget has, a task's box read only. An item is drawn
// with its lists before the next is paid for, so a cut never leaves a later item below a hole.
export function outline(block: Outline, on: Ink): ReactNode {
  const lis: ReactNode[] = [];
  for (const item of block.items) {
    if (!on.budget.spend(weigh(item.children))) break;
    lis.push(
      createElement(
        "li",
        { "data-task": item.task === "none" ? undefined : item.task },
        item.task === "none"
          ? undefined
          : createElement("input", {
              type: "checkbox",
              checked: item.task === "done",
              disabled: true,
              readOnly: true,
              "aria-label": item.task === "done" ? "Done" : "Not done",
            }),
        ...drawInlines(item.children, on),
        ...item.sub.map((sub) => outline(sub, on)),
      ),
    );
  }
  if (lis.length === 0) return undefined;
  return createElement(
    block.ordered ? "ol" : "ul",
    block.ordered && block.start !== 1 ? { start: block.start } : null,
    ...lis,
  );
}
