import styles from "./Field.module.css";

/** What a field says of its words: its help, its error, which is shown and described to the box, and a live region that says the
 * error with the field's name, waiting on the page empty so the error is announced when it comes (F335, F356). A box that draws
 * its own field (the chat's composer) uses it as the Field does. */
export function FieldWords({
  id,
  label,
  help,
  error,
}: {
  /** The id the field's box has: the words' ids are `${id}-help` and `${id}-error`. */
  id: string;
  label: string;
  help?: string | undefined;
  error?: string | undefined;
}) {
  return (
    <>
      {help === undefined ? null : (
        <p id={`${id}-help`} className="meta">
          {help}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={styles["error"]} aria-hidden="true">
          {error}
        </p>
      )}
      <span role="status" className="visually-hidden">
        {error === undefined ? "" : `${label}: ${error}`}
      </span>
    </>
  );
}
