// The display's settings (ADR-0002 §9): the scene's quality, Auto, High or Low; reduce animations beyond the system's own word; the 3D
// on a phone, which otherwise waits for "View in space".
import { Switch } from "@gnoworld/ui";
import { useId } from "react";
import type { Settings } from "../../lib/keep/fields.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { Section, Setting } from "./Section.tsx";
import styles from "./Settings.module.css";

const QUALITIES = [
  { value: "auto", label: "Auto", help: "Starts high and steps down if the device struggles." },
  { value: "high", label: "High", help: "Every effect, on a device that can take it." },
  { value: "low", label: "Low", help: "Thinner dust and effects, simpler atmospheres." },
] as const;

// The quality: one pill of three radios (the header's bar), a cream fill sliding under the chosen one, whose line shows under the name.
function Quality({
  quality,
  onChoose,
}: {
  quality: Settings["quality"];
  onChoose: (quality: Settings["quality"]) => void;
}) {
  const id = useId();
  const at = Math.max(
    0,
    QUALITIES.findIndex(({ value }) => value === quality),
  );
  return (
    <Setting
      name={
        <span id={`${id}-name`} className={styles["name"]}>
          Quality
        </span>
      }
      line={
        <span id={`${id}-line`} className={["meta", styles["line"]].join(" ")}>
          {QUALITIES[at]?.help}
        </span>
      }
    >
      <div
        role="radiogroup"
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-line`}
        className={["control-bar", styles["segment"]].join(" ")}
        data-at={at}
      >
        <span className={styles["fill"]} aria-hidden="true" />
        {QUALITIES.map(({ value, label }) => (
          <label key={value} className={styles["option"]}>
            <input
              type="radio"
              name={id}
              className={styles["radio"]}
              checked={quality === value}
              onChange={() => {
                onChoose(value);
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </Setting>
  );
}

export function DisplaySection() {
  const store = useAppStore();
  const settings = useApp(({ device }) => device.settings);
  const set = (change: Partial<Settings>) => {
    store.getState().deviceActions.change("settings", (held) => ({ ...held, ...change }));
  };
  return (
    <Section id="settings-display" title="Display">
      <Quality
        quality={settings.quality}
        onChoose={(quality) => {
          set({ quality });
        }}
      />
      <Switch
        label="Reduce animations"
        description="Nothing flies or flares; your system's setting counts too."
        checked={settings.calm}
        onChange={(calm) => {
          set({ calm });
        }}
      />
      <Switch
        label="Space in 3D on a phone"
        description="On a phone, the worlds show as a list until you ask for space."
        checked={settings.phone3d}
        onChange={(phone3d) => {
          set({ phone3d });
        }}
      />
    </Section>
  );
}
