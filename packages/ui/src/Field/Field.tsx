import { useId, useRef, type KeyboardEvent } from "react";
import { Stack } from "../compositions/index.ts";
import { ids } from "../ids.ts";
import styles from "./Field.module.css";

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Text unless asked; a date is the browser's date and time; lines is a box of several lines, in which Enter
   * submits the form and Shift+Enter adds a line, a chat's box. */
  kind?: "text" | "search" | "date" | "lines";
  /** In a box of lines, Enter adds a line, and the form's button submits: a touch keyboard has no Shift. */
  enterAddsLine?: boolean | undefined;
  help?: string;
  error?: string;
  /** What the empty box says it is for, muted in the box: the chat's "Message #general". */
  placeholder?: string | undefined;
  /** Words inside the box before its value, not editable and read with the field: "nym-" before a name. */
  prefix?: string;
  /** A box of lines has a handle to drag its height by, unless it grows on its own, as a chat's does to ten lines. */
  resizable?: boolean | undefined;
  /** The label is for assistive technology alone: the box says what it is for itself (a placeholder). */
  hideLabel?: boolean | undefined;
  /** The ids of what else on the page says what the box is about (a composer's reply bar), after its help. */
  describedBy?: string | undefined;
}

const TYPES = { text: "text", search: "search", date: "datetime-local" } as const;

// Enter sends the form, but not the Enter that ends an input method's composition, which only picks the word: Safari
// sends that one after compositionend, isComposing false, keyCode 229 (F1713): the only mark it gives, deprecated
// and still sent, so read by name.
function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, composing: boolean): void {
  const { isComposing } = event.nativeEvent;
  if (event.key !== "Enter" || event.shiftKey || composing || isComposing) return;
  if (Reflect.get(event.nativeEvent, "keyCode") === 229) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

interface BoxProps extends Pick<FieldProps, "value" | "onChange" | "enterAddsLine" | "placeholder" | "resizable"> {
  kind: NonNullable<FieldProps["kind"]>;
  id: string;
  invalid: boolean;
  described: string | undefined;
}

// The box itself: a line of text, or the lines of a message.
function Box({ kind, id, value, invalid, described, enterAddsLine, placeholder, resizable, onChange }: BoxProps) {
  const composingRef = useRef(false);
  const shared = {
    id,
    className: styles["box"],
    value,
    placeholder,
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": described,
    "data-fixed": resizable === false ? "" : undefined,
  };
  return kind === "lines" ? (
    <textarea
      {...shared}
      rows={2}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
      onKeyDown={(event) => {
        if (enterAddsLine !== true) submitOnEnter(event, composingRef.current);
      }}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ) : (
    <input
      {...shared}
      type={TYPES[kind]}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

// What reads with the box, in order: its prefix, its help, its error, then the page's words.
function describing(
  id: string,
  parts: Partial<Record<"prefix" | "help" | "error" | "describedBy", string | undefined>>,
) {
  const own = (["prefix", "help", "error"] as const).filter((name) => parts[name] !== undefined);
  return ids(...own.map((name) => `${id}-${name}`), parts.describedBy);
}

/** A labelled box, described by its help and its error, which also marks it invalid. */
export function Field({
  label,
  value,
  onChange,
  kind = "text",
  help,
  error,
  prefix,
  describedBy,
  hideLabel,
  resizable,
  enterAddsLine,
  placeholder,
}: FieldProps) {
  const id = useId();
  const described = describing(id, { prefix, help, error, describedBy });
  const box = (
    <Box
      kind={kind}
      id={id}
      value={value}
      invalid={error !== undefined}
      described={described || undefined}
      enterAddsLine={enterAddsLine}
      placeholder={placeholder}
      resizable={resizable}
      onChange={onChange}
    />
  );
  return (
    <Stack space="2xs">
      <label htmlFor={id} className={hideLabel === true ? "visually-hidden" : "label"}>
        {label}
      </label>
      {prefix === undefined ? (
        box
      ) : (
        <div data-part="box" className={styles["frame"]}>
          <span id={`${id}-prefix`} className={styles["prefix"]}>
            {prefix}
          </span>
          {box}
        </div>
      )}
      {help === undefined ? null : (
        <p id={`${id}-help`} className={styles["help"]}>
          {help}
        </p>
      )}
      {/* Shown, and described to the box; said by the region below with its field's name, waiting on the
          page empty so the error is announced when it comes (F335, F356). */}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={styles["error"]} aria-hidden="true">
          {error}
        </p>
      )}
      <span role="status" className="visually-hidden">
        {error === undefined ? "" : `${label}: ${error}`}
      </span>
    </Stack>
  );
}
