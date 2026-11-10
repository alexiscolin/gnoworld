import styles from "./Swap.module.css";

/** A text that fades in where it stands when it changes after a fresh read (a block's height and time): a changed key is a new span. */
export const Swap = ({ children }: { children: string }) => (
  <span key={children} className={styles["swap"]}>
    {children}
  </span>
);
