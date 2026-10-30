// What every page sits in: the store, the page's links (F326), the header and the main column. Layout (root.tsx) wraps the
// document around it; apart, so a test can render it without the router's document components.
import { Center } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { UpdatePrompt } from "./features/update/index.ts";
import { site, type UniverseView } from "./places.ts";
import { AppLinks } from "./routerLink.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import { StoreProvider } from "./storeContext.tsx";

// The universe a page belongs to is in its path (/net/<id>/...), the default one's pages have none; a path that names no
// universe (a page not found, an error) is the default's: the header always says what is true.
function universeAt(pathname: string): UniverseView {
  const id = /^\/net\/([^/]+)/.exec(pathname)?.[1];
  const found = site.universes.find((each) => each.id === id) ?? site.universes.find((each) => each.isDefault);
  if (found === undefined) throw new RangeError("the data holds no default universe");
  return found;
}

export function Shell({ children }: { children: ReactNode }) {
  const universe = universeAt(useLocation().pathname);
  return (
    <StoreProvider>
      <AppLinks>
        <ShellHeader universe={universe} />
        <Center max="page">
          <main>{children}</main>
        </Center>
        <UpdatePrompt />
      </AppLinks>
    </StoreProvider>
  );
}
