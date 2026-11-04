// A figure of the info panel and its caption, as ui's Stat sets them, without its count-up, which the late chat's budget cannot carry.
import styles from "./PlaceInfo.module.css";

export function Figure({ value, caption }: { value: number; caption: string }) {
  return (
    <div>
      <p className={styles["figure"]}>{value}</p>
      <p className="label">{caption}</p>
    </div>
  );
}
