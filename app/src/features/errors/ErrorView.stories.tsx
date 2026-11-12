import { ErrorView, type ErrorViewProps } from "./ErrorView.tsx";

// Storybook reads this file from packages/ui's config; the app has no Storybook types of its own, so the stories are plain.
const base: ErrorViewProps = { kind: "crash", where: { here: "/w/bubble", earth: "/earth", galaxy: "/" } };
export default { component: ErrorView, args: base };
const story = (args: Partial<ErrorViewProps>) => ({ args: { ...base, ...args } });
export const NotFound = story({ kind: "not-found", noun: "world" });
export const Gone = story({ kind: "gone", noun: "realm" });
export const Forbidden = story({ kind: "forbidden" });
export const TooManyRequests = story({ kind: "too-many" });
export const Offline = story({ kind: "offline" });
export const Unavailable = story({ kind: "unavailable", note: "Reference: 2026-11-12T10:20:30Z /w/bubble" });
export const NewVersion = story({ kind: "new-version" });
export const Crash = story({ kind: "crash", note: "Reference: 2026-11-12T10:20:30Z /w/bubble" });
export const CrashInDevelopment = story({ kind: "crash", detail: "Error: a bug\n    at Scene (scene.tsx:12:3)" });
export const InAPlate = story({ kind: "not-found", noun: "realm", size: "place" });
export const Inline = story({ kind: "unavailable", size: "inline" });
export const InlineWithRetry = story({ kind: "offline", size: "inline", onRetry: () => undefined });
