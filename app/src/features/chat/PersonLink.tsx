// An account drawn as a person anywhere (a plate's callers, a call's caller, a token's holders): its name opens the same card as a
// chat line's author does, on a click and on Enter. Unlike a line's name it is a Tab stop, as no bar of actions stands beside it.
import type { ReactNode } from "react";
import { useApp } from "../../storeContext.tsx";
import { PersonCard } from "./PersonCard.tsx";

export function PersonLink({
  address,
  children,
  asIcon,
}: {
  address: string;
  children?: ReactNode;
  asIcon?: "s" | "m";
}) {
  const me = useApp(({ login }) => (login.session.kind === "in" ? login.session.address : undefined));
  return (
    <PersonCard name={address} guest={false} country={undefined} me={me} tabbable asIcon={asIcon}>
      {children}
    </PersonCard>
  );
}
