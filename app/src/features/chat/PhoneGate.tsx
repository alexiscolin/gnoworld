// A phone is the full chat only: a place on a phone goes to its full chat (phoneGo.ts). The code of the going is asked once the window
// is a phone's, so a computer never carries it; the page draws nothing while it comes.
import { PHONE_QUERY } from "@gnoworld/core";
import type { ReactNode } from "react";
import { ErrorView, errorKind } from "../errors/index.ts";
import { chunked } from "./Failing.tsx";
import { useMedia } from "./useMedia.ts";

const Going = chunked(async () => ({ default: (await import("./PhoneGoing.tsx")).PhoneGoing }), {
  waiting: null,
  failed: (error) => <ErrorView kind={errorKind(error)} size="inline" urgent />,
});

/** `children` as they are on a computer; on a phone, through the going (false while hydrating, as the server drew it). */
export function PhoneGate({ children }: { children: ReactNode }) {
  return useMedia(PHONE_QUERY) ? <Going>{children}</Going> : children;
}
