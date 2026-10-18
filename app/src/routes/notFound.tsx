// Any path no route matches: not found, inside the page, with the shell and its links around it.
import { data } from "react-router";
import { notFoundMeta } from "../meta.ts";
import { ErrorNotice } from "../ui/ErrorNotice.tsx";

// A loader in the browser makes the router wait before it hydrates, so the static host's
// fallback page and the client render the same thing: the router's answer, then this boundary.
export function clientLoader(): never {
  throw data(null, { status: 404 });
}

export const meta = notFoundMeta;

export function ErrorBoundary() {
  return <ErrorNotice title="No page here">Nothing on gno.world goes by this address.</ErrorNotice>;
}
