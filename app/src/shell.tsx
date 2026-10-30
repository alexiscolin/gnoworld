// What every page sits in: the store, the page's links (F326), the header and the main column. Layout (root.tsx) wraps the
// document around it; apart, so a test can render it without the router's document components.
import { Center } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { UpdatePrompt } from "./features/update/index.ts";
import { site } from "./places.ts";
import { AppLinks } from "./routerLink.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import { StoreProvider } from "./storeContext.tsx";

export function Shell({ children }: { children: ReactNode }) {
  const universe = site.universeAt(useLocation().pathname);
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
