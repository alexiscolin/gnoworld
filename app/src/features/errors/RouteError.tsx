import { useEffect, useSyncExternalStore } from "react";
import { useLocation, useRouteError } from "react-router";
import { site } from "../../places.ts";
import { ErrorView } from "./ErrorView.tsx";
import { errorKind } from "./kind.ts";
import { sessionStore } from "../../lib/keep/session.ts";
import { referenceOf, reloadOnce, report, stamp } from "./report.ts";

/** Where an error's ways lead from this page: the page itself, its universe's Earth and its Galaxy. */
export function useWhere() {
  const { pathname } = useLocation();
  const universe = site.universeAt(pathname);
  return { here: pathname, earth: universe.earth.path, galaxy: universe.home.path };
}

/** The one boundary of every route: sorts the error, shows its words in the page (or in a plate, `size="place"`), tells the browser of a
 * crash once, reloads once for a new version, and shows a reference to quote (in development, the message and stack). */
export function RouteError({ noun, size = "page" }: { noun?: string; size?: "page" | "place" }) {
  const error = useRouteError();
  const where = useWhere();
  const pathname = where.here;
  const kind = errorKind(error);
  // The time is read in the browser only: the server's page has none, so nothing differs at hydration.
  const reference = useSyncExternalStore(
    () => () => undefined,
    () => referenceOf(stamp(error), pathname),
    () => undefined,
  );
  useEffect(() => {
    report(kind, pathname);
    if (kind === "new-version") {
      reloadOnce(sessionStore(), () => {
        location.reload();
      });
    }
  }, [error, kind, pathname]);
  const detail =
    import.meta.env.DEV && error instanceof Error ? `${error.message}\n${error.stack ?? ""}`.trim() : undefined;
  return (
    <ErrorView
      kind={kind}
      noun={noun}
      size={size}
      where={where}
      note={
        import.meta.env.DEV || reference === undefined || (kind !== "crash" && kind !== "unavailable")
          ? undefined
          : `Reference: ${reference}`
      }
      detail={detail}
    />
  );
}
