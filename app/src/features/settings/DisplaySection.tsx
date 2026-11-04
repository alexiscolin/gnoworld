// The display's settings (ADR-0002 §9): the scene's quality, Auto, High or Low; reduce animations beyond the system's own word; the 3D
// on a phone, which otherwise waits for "View in space".
import type { Settings } from "../../lib/keep/fields.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { Stack } from "@gnoworld/ui";
import styles from "./Settings.module.css";

const QUALITIES = [
  { value: "auto", label: "Auto", help: "Starts high and steps down if the device struggles." },
  { value: "high", label: "High", help: "Every effect, on a device that can take it." },
  { value: "low", label: "Low", help: "Thinner dust and effects, simpler atmospheres." },
] as const;

export function DisplaySection() {
  const store = useAppStore();
  const settings = useApp(({ device }) => device.settings);
  const set = (change: Partial<Settings>) => {
    store.getState().deviceActions.change("settings", (held) => ({ ...held, ...change }));
  };
  return (
    <section aria-labelledby="settings-display">
      <Stack space="xs">
        <h3 id="settings-display">Display</h3>
        <fieldset className={styles["choices"]}>
          <legend className="label">Quality</legend>
          {QUALITIES.map(({ value, label, help }) => (
            <label key={value} className={styles["choice"]}>
              <input
                type="radio"
                name="quality"
                value={value}
                checked={settings.quality === value}
                onChange={() => {
                  set({ quality: value });
                }}
              />
              <span>
                {label}
                <small className={styles["help"]}>{help}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className={styles["choice"]}>
          <input
            type="checkbox"
            checked={settings.calm}
            onChange={(event) => {
              set({ calm: event.currentTarget.checked });
            }}
          />
          <span>
            Reduce animations
            <small className={styles["help"]}>Nothing flies or flares; your system&apos;s setting counts too.</small>
          </span>
        </label>
        <label className={styles["choice"]}>
          <input
            type="checkbox"
            checked={settings.phone3d}
            onChange={(event) => {
              set({ phone3d: event.currentTarget.checked });
            }}
          />
          <span>
            Space in 3D on a phone
            <small className={styles["help"]}>On a phone, the worlds show as a list until you ask for space.</small>
          </span>
        </label>
      </Stack>
    </section>
  );
}
