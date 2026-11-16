import { createContext, use, type ReactNode } from "react";

// The place's own page (its plate, lazy), handed down by the route through PlaceChat to the chat it draws alone, for the phone's "Its page" sheet:
// a feature never imports a route, so the route gives the element and the sheet only draws it. None: the place has no page.
const PlacePageContext = createContext<ReactNode>(null);

export const PlacePageProvider = PlacePageContext.Provider;

export function usePlacePage(): ReactNode {
  return use(PlacePageContext);
}

/** Whether the page is drawn in a phone's page sheet (PlaceSheet.tsx), where a link to another place's page opens that page's sheet (the
 * proposals' link, features/world/Actions.tsx) and a computer's page, which has none, keeps its link as it is. */
const InPageSheetContext = createContext(false);

export const InPageSheet = InPageSheetContext.Provider;

export const useInPageSheet = (): boolean => use(InPageSheetContext);

/** The search parameter naming the open sheet. */
export const SHEET = "sheet";
/** A phone's sheets, the shallower first (phoneSheet.ts keeps their history). */
export type Sheet = "info" | "page";

/** `href` (a path of this site) opening on `sheet`. Here, not with the sheets' history, so a page's link to a sheet (the proposals') carries
 * none of it on the first screen. */
export function sheetHref(href: string, sheet: Sheet): string {
  const url = new URL(href, "https://site.invalid");
  url.searchParams.set(SHEET, sheet);
  return `${url.pathname}${url.search}${url.hash}`;
}
