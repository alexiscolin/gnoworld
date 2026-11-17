// The one muted line a room says when translating stopped: the day's budget is spent, or Jarvis is off; never one under each line.
import { useTranslationHalt } from "../../../roomTranslations.ts";
import styles from "../lines/RoomView.module.css";

const WHY = {
  spent: "Translations are used up for today: messages stay as they were written.",
  off: "Translation is off for now: messages stay as they were written.",
} as const;

export function TranslationHalt() {
  const halt = useTranslationHalt();
  return halt === undefined ? null : (
    <p role="status" className={["meta", styles["lead"]].join(" ")}>
      {WHY[halt]}
    </p>
  );
}
