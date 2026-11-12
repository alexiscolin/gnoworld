import { isRouteErrorResponse } from "react-router";

export type ErrorKind =
  "not-found" | "gone" | "forbidden" | "too-many" | "offline" | "unavailable" | "new-version" | "crash";

// A status the server or a failed read gave, or none.
const STATUS: Readonly<Record<number, ErrorKind>> = {
  404: "not-found",
  410: "gone",
  401: "forbidden",
  403: "forbidden",
  429: "too-many",
  502: "unavailable",
  503: "unavailable",
  504: "unavailable",
};

// What a browser says of a lazy chunk it could not fetch (Chromium, Firefox, Safari), and of a fetch that never reached its server.
const CHUNK = /dynamically imported module|importing a module script failed|ChunkLoadError/i;
const UNREACHED = /failed to fetch|load failed|networkerror when attempting to fetch/i;

function statusOf(error: unknown): number | undefined {
  if (isRouteErrorResponse(error)) return error.status;
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number")
    return error.status;
  return undefined;
}

// A failure that carries no status: by what the browser said of it.
function bySaying(error: unknown, online: boolean): ErrorKind {
  const said = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (CHUNK.test(said)) return online ? "new-version" : "offline";
  return !online || (error instanceof TypeError && UNREACHED.test(said)) ? "offline" : "crash";
}

/** What kind of failure `error` is, for the words and the way on it gets; `online` is the browser's own word on its network. */
export function errorKind(
  error: unknown,
  online = typeof navigator === "undefined" || !("onLine" in navigator) || navigator.onLine,
): ErrorKind {
  const status = statusOf(error);
  return status === undefined ? bySaying(error, online) : (STATUS[status] ?? "crash");
}

/** Whether a route's error is React Router's 404: a place the data does not hold, apart from a failure. */
export function isMissing(error: unknown): boolean {
  return isRouteErrorResponse(error) && error.status === 404;
}
