// A phone's sheets (Info, then the place's page) in the address, a search parameter the router owns: opening one adds a history entry, so
// the browser's Back closes the page to the info, the info, and only then leaves; a reload or a link that holds it opens the sheet.
// Never a hash (the plates use them for their own sections) and never in a shared link (share/link.ts drops the query).
import { useLocation, useNavigate } from "react-router";
import { SHEET, type Sheet } from "./placePage.ts";

const DEPTH = { info: 1, page: 2 } as const;

/** The sheet the search names; none for any other value. */
export function sheetOf(params: URLSearchParams): Sheet | undefined {
  const asked = params.get(SHEET);
  return asked === "info" || asked === "page" ? asked : undefined;
}

/** The open sheet and the way to another (none closes). Going deeper pushes an entry that says so (its state); going one up pops it when
 * it is this code's own, else (a reload, a link) replaces the address, so the entry before stays the page's. */
export function useSheet(): { sheet: Sheet | undefined; move: (to: Sheet | undefined) => void } {
  const { pathname, search, hash, ...at } = useLocation();
  const state: unknown = at.state;
  const navigate = useNavigate();
  const sheet = sheetOf(new URLSearchParams(search));
  const depth = sheet === undefined ? 0 : DEPTH[sheet];
  const ours = typeof state === "object" && state !== null && "sheet" in state && state.sheet === depth;
  return {
    sheet,
    move: (to) => {
      const target = to === undefined ? 0 : DEPTH[to];
      const params = new URLSearchParams(search);
      if (to === undefined) params.delete(SHEET);
      else params.set(SHEET, to);
      const query = params.toString();
      const next = { pathname, search: query === "" ? "" : `?${query}`, hash };
      const done =
        target > depth
          ? navigate(next, { state: { sheet: target } })
          : ours && target === depth - 1
            ? navigate(-1)
            : navigate(next, { replace: true });
      Promise.resolve(done).catch(reportError);
    },
  };
}
