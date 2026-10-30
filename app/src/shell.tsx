// What every page sits in: the store, the page's links (F326), the header and the main column. Layout (root.tsx) wraps the
// document around it; apart, so a test can render it without the router's document components.
import { Center, Cluster } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LoginControl } from "./features/login/index.ts";
import { UpdatePrompt } from "./features/update/index.ts";
import { AppLinks } from "./routerLink.tsx";
import { StoreProvider } from "./storeContext.tsx";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <AppLinks>
        <Center as="header" max="page" gutter="all">
          <Cluster justify="between">
            <Link to="/">gno.world</Link>
            {/* The search 5n adds sits here, between the home link and the account. */}
            <LoginControl />
          </Cluster>
        </Center>
        <Center max="page">
          <main>{children}</main>
        </Center>
        <UpdatePrompt />
      </AppLinks>
    </StoreProvider>
  );
}
