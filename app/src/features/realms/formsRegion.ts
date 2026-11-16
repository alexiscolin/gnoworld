// The page's forms, drawn after its text: a region of their own once a card of an action is open or a plain form stands in it.
import { createElement, lazy, Suspense, type ReactNode } from "react";

const ActionForms = lazy(async () => ({ default: (await import("./PageAction.tsx")).ActionForms }));

/** The forms region of a page: `cards` are the ids of its actions' cards, among `forms`. */
export function formsRegion(forms: readonly ReactNode[], cards: readonly string[], className?: string): ReactNode {
  if (forms.length === 0) return undefined;
  if (cards.length === 0) return createElement("section", { className, "aria-label": "Forms" }, ...forms);
  const shown = { cards, plain: forms.length - cards.length, className };
  return createElement(Suspense, { fallback: null }, createElement(ActionForms, shown, ...forms));
}
