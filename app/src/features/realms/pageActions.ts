// A realm page's actions: a `$help` link of its own realm drawn as a button where it stood, its card (nothing till opened)
// joining the page's forms, a block, never inside a paragraph; named from the page, as its forms' cards are.
import { createElement, lazy, Suspense, type ReactNode } from "react";
import type { Ink } from "./drawBudget.ts";
import type { CallPlace } from "./InlineCard.tsx";

// The realm view's own, one chunk: the call card's code comes only as one is drawn.
const PageAction = lazy(async () => ({ default: (await import("./PageAction.tsx")).PageAction }));
const ActionCard = lazy(async () => ({ default: (await import("./PageAction.tsx")).ActionCard }));

/** The page's action drawer, or none outside a realm's view: each card goes to `forms` and its id to `cards`, at `level()`. */
export function actionsOf(
  named: { place: CallPlace; page: string } | undefined,
  { forms, cards }: { forms: ReactNode[]; cards: string[] },
  level: () => 2 | 3 | 4,
): Ink["action"] {
  if (named === undefined) return undefined;
  return (node, label) => {
    const id = `${named.page}-action-${String(forms.length)}`;
    cards.push(id);
    const card = createElement(ActionCard, { id, place: named.place, level: level() });
    forms.push(createElement(Suspense, { key: id, fallback: null }, card));
    const button = createElement(PageAction, { id, func: node.func, args: node.args, place: named.place, label });
    return createElement(Suspense, { key: id, fallback: createElement("span", null, ...label) }, button);
  };
}
