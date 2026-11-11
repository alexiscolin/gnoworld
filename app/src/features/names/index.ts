// The account's name and the dialog that registers one (9f): loaded on their own, after the first screen, by the account's menu. The dialog's
// code, the signing parts included, is a chunk of its own, asked when it is first drawn (a lazy component resolves to a function, never to
// another lazy one: React's error 306).
import { createElement, lazy, Suspense, type ComponentProps } from "react";

export { NameLabel } from "./Label.tsx";
export { useMemberNames } from "./useMemberNames.ts";

const Dialog = lazy(async () => ({ default: (await import("./PickName.tsx")).PickName }));

export function PickName(props: ComponentProps<typeof Dialog>) {
  return createElement(Suspense, { fallback: null }, createElement(Dialog, props));
}
