// The bubbles over a world that is not the Earth: the rooms its page follows, each speaker on a spot of their own (spot.ts). The code of the
// Earth's signs, which they are, comes in its own chunk once the page has one to show.
import { PHONE_QUERY } from "@gnoworld/core";
import { lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { useAppStore } from "../../storeContext.tsx";

// Asked as this module runs, not as the first render does: the plate's chunk, asked at the page's load, would hold the signs' code behind it.
// A phone's window draws no page of signs (its chat alone has them), so it asks at the first render, if ever.
const ask = () =>
  import("../../EarthSigns.tsx").then(
    (signs) => ({ signs }),
    (cause: unknown) => ({ cause }),
  );
const earth = typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches ? undefined : ask();
// A failure is kept as a value and thrown here, at the first render: a rejection nobody awaits yet is unhandled (vitest list failed on it).
const Signs = lazy(async () => {
  const got = await (earth ?? ask());
  if ("cause" in got) throw new Error("the Earth signs' chunk did not load", { cause: got.cause });
  return { default: got.signs.PageSigns };
});

/** The newest words of the rooms the page follows as bubbles on the planet `world`, the page's; the Earth's, with none. */
export function WorldSigns({ world }: { world?: string }) {
  const store = useAppStore();
  const navigate = useNavigate();
  return (
    <Suspense fallback={null}>
      <Signs
        store={store}
        open={(href) => {
          Promise.resolve(navigate(href)).catch(reportError);
        }}
        {...(world === undefined ? {} : { world: { id: world } })}
      />
    </Suspense>
  );
}
