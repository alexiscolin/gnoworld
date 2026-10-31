// The realm's view as the route draws it: its code (core's page reader, the chat's drawing) is a chunk of its own, asked when
// the view is first drawn and never by the first screen; a chunk that cannot be fetched leaves a line, not a blank page.
import { chunked } from "../chat/index.ts";
import type { RealmViewProps } from "./RealmView.tsx";

export const RealmView = chunked<RealmViewProps>(
  async () => ({ default: (await import("./RealmView.tsx")).RealmView }),
  {
    waiting: <p role="status">Reading the page…</p>,
    failed: <p role="alert">This view could not load. Reload the page to try again.</p>,
  },
);
