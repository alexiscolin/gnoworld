// The loader's look, apart from its waiting (SpaceLoader.tsx): the logo where the header's stands and one thin bar, filled by quarters. The host's
// fallback page draws it too, still, from its first paint (FirstLoader), so a page with no HTML of its own never shows black while it loads.
import { Logo } from "@gnoworld/ui";
import styles from "./SpaceLoader.module.css";

// The bar's fill, in quarters: a style attribute in the page's first HTML would be refused by its policy.
export const STEPS = 4;

export function LoaderMarks({ step }: { step: number }) {
  return (
    <>
      <span className={styles["brand"]}>
        <Logo wordmark />
      </span>
      <span className={styles["bar"]} aria-hidden="true">
        <span className={styles["fill"]} data-step={step} />
      </span>
    </>
  );
}

/** In every page's HTML, seen only at a first load while the page's column is still empty, which only the fallback's is (SpaceLoader.module.css):
 * the cosmos's own loader then takes its place, any other page fades it. */
export function FirstLoader() {
  return (
    <div role="status" aria-label="Loading space" data-first-loader="" className={styles["loader"]}>
      <LoaderMarks step={0} />
    </div>
  );
}
