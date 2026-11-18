// The loader's look, apart from its waiting (SpaceLoader.tsx): the logo where the header's stands and one thin bar, filled by quarters.
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
