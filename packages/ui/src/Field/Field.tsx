import { useId } from "react";
import { Sidebar, Stack } from "../compositions/index.ts";
import styles from "./Field.module.css";

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Text unless asked; a date is the browser's date and time. */
  kind?: "text" | "search" | "date";
  help?: string;
  error?: string;
  /** Words before the box, outside its value: "@" before a name. */
  prefix?: string;
}

const TYPES = { text: "text", search: "search", date: "datetime-local" } as const;

/** A labelled box, described by its help and its error, which also marks it invalid. */
export function Field({ label, value, onChange, kind = "text", help, error, prefix }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const described = [help === undefined ? null : helpId, error === undefined ? null : errorId].filter(Boolean);
  const box = (
    <input
      id={id}
      type={TYPES[kind]}
      className={styles["box"]}
      value={value}
      aria-invalid={error === undefined ? undefined : true}
      aria-describedby={described.join(" ") || undefined}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
  return (
    <Stack space="2xs">
      <label htmlFor={id} className={styles["label"]}>
        {label}
      </label>
      {prefix === undefined ? (
        box
      ) : (
        <Sidebar space="2xs">
          <span className={styles["prefix"]}>{prefix}</span>
          {box}
        </Sidebar>
      )}
      {help === undefined ? null : (
        <p id={helpId} className={styles["help"]}>
          {help}
        </p>
      )}
      {/* Shown, and described to the box; said by the region below, which waits on the page empty so
          the error is announced when it comes (F335). */}
      {error === undefined ? null : (
        <p id={errorId} className={styles["error"]} aria-hidden="true">
          {error}
        </p>
      )}
      <span role="status" className="visually-hidden">
        {error ?? ""}
      </span>
    </Stack>
  );
}
