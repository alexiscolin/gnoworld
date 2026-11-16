import { createContext, use, type ReactNode } from "react";

// The place's own page (its plate, lazy), handed down by the route through PlaceChat to the chat it draws alone, for the phone's "Its page" sheet:
// a feature never imports a route, so the route gives the element and the sheet only draws it. None: the place has no page.
const PlacePageContext = createContext<ReactNode>(null);

export const PlacePageProvider = PlacePageContext.Provider;

export function usePlacePage(): ReactNode {
  return use(PlacePageContext);
}
