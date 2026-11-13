import { lazy, Suspense, type ReactNode } from "react";

const Chunk = lazy(async () => ({ default: (await import("./PersonLink.tsx")).PersonLink }));

/** An account's person card, in a chunk asked as the plate draws: the name shows meanwhile, an icon's button nothing. */
export function PersonLink({
  address,
  children,
  asIcon,
}: {
  address: string;
  children?: ReactNode;
  asIcon?: "s" | "m";
}) {
  return (
    <Suspense fallback={asIcon === undefined ? children : null}>
      <Chunk address={address} {...(asIcon === undefined ? {} : { asIcon })}>
        {children}
      </Chunk>
    </Suspense>
  );
}
