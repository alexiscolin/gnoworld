import { useId, useRef, type KeyboardEvent } from "react";
import { Sidebar, Stack } from "../compositions/index.ts";
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
  /** Words before the box, outside its value: "@" before a name. */
  prefix?: string;
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

interface BoxProps extends Pick<FieldProps, "value" | "onChange" | "enterAddsLine" | "placeholder"> {
  kind: NonNullable<FieldProps["kind"]>;
  id: string;
  invalid: boolean;
  described: string | undefined;
}

// The box itself: a line of text, or the lines of a message.
function Box({ kind, id, value, invalid, described, enterAddsLine, placeholder, onChange }: BoxProps) {
  const composingRef = useRef(false);
  const shared = {
    id,
    className: styles["box"],
    value,
    placeholder,
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": described,
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
  enterAddsLine,
  placeholder,
}: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const described = [help === undefined ? null : helpId, error === undefined ? null : errorId, describedBy].filter(
    Boolean,
  );
  const box = (
    <Box
      kind={kind}
      id={id}
      value={value}
      invalid={error !== undefined}
      described={described.join(" ") || undefined}
      enterAddsLine={enterAddsLine}
      placeholder={placeholder}
      onChange={onChange}
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
      {/* Shown, and described to the box; said by the region below with its field's name, waiting on the
          page empty so the error is announced when it comes (F335, F356). */}
      {error === undefined ? null : (
        <p id={errorId} className={styles["error"]} aria-hidden="true">
          {error}
        </p>
      )}
      <span role="status" className="visually-hidden">
        {error === undefined ? "" : `${label}: ${error}`}
      </span>
    </Stack>
  );
}
