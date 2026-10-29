import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Stack } from "../compositions/index.ts";
import field from "../Field/Field.module.css";
import menu from "../Popover/Popover.module.css";
import styles from "./Combobox.module.css";

export interface ComboboxOption {
  /** What onSelect is given: unique among all the options. */
  id: string;
  label: string;
}
export interface ComboboxGroup {
  id: string;
  label: string;
  options: ComboboxOption[];
}
export interface ComboboxProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** The options, grouped. Each group is named with the count of its options. */
  groups: ComboboxGroup[];
  onSelect: (id: string) => void;
}

/** A group draws its first options only: a list of thousands is a page's weight, and a query narrows it. */
const SHOWN = 50;

// The Enter that ends an input method's composition only picks the word; Safari sends it with isComposing false and keyCode 229.
const composing = (event: KeyboardEvent) =>
  event.nativeEvent.isComposing || Reflect.get(event.nativeEvent, "keyCode") === 229;

/** The option an arrow moves to, round the ends; from none, down is the first and up the last. */
function moved(key: string, at: number, length: number): number {
  const step = key === "ArrowDown" ? 1 : -1;
  if (at < 0) return step === 1 ? 0 : length - 1;
  return (at + step + length) % length;
}

interface DrawnGroup extends ComboboxGroup {
  drawn: ComboboxOption[];
  /** Its first drawn option's place in the whole list. */
  first: number;
}

function Listbox({
  id,
  label,
  groups,
  optionId,
  active,
  onSelect,
}: Pick<ComboboxProps, "label" | "onSelect"> & {
  id: string;
  groups: DrawnGroup[];
  optionId: (index: number) => string;
  active: string | undefined;
}) {
  return (
    <div id={id} role="listbox" aria-label={label} className={styles["list"]}>
      {groups.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`${id}-${group.id}`}>
          <div id={`${id}-${group.id}`} className={styles["group"]}>
            {group.label} {group.options.length}
          </div>
          {group.drawn.map((option, n) => (
            <div
              key={option.id}
              id={optionId(group.first + n)}
              role="option"
              aria-selected={optionId(group.first + n) === active}
              className={menu["item"]}
              // The click chooses, and the field keeps the focus.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onSelect(option.id);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** WAI-ARIA's combobox with a listbox popup, always open: the focus stays in the field, the arrows move the active option,
 * Enter chooses it. Escape is left to what holds it (a dialog). */
export function Combobox({ label, value, onValueChange, groups, onSelect }: ComboboxProps) {
  const rootId = useId();
  const drawnOf = groups.map((group) => group.options.slice(0, SHOWN));
  const shown: DrawnGroup[] = groups.map((group, n) => ({
    ...group,
    drawn: drawnOf[n] ?? [],
    first: drawnOf.slice(0, n).reduce((sum, drawn) => sum + drawn.length, 0),
  }));
  const flat = drawnOf.flat();
  const [activeId, setActiveId] = useState<string | null>(null);
  // An option the list no longer holds is no longer active.
  const at = flat.findIndex((option) => option.id === activeId);
  const optionId = (index: number) => `${rootId}-option-${String(index)}`;
  const active = at < 0 ? undefined : optionId(at);
  useEffect(() => {
    if (active !== undefined) document.getElementById(active)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const chosen = flat[at];
    if (event.key === "Enter" && chosen !== undefined && !composing(event)) {
      event.preventDefault();
      onSelect(chosen.id);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && flat.length > 0) {
      event.preventDefault();
      setActiveId(flat[moved(event.key, at, flat.length)]?.id ?? null);
    }
  }

  const listId = `${rootId}-list`;
  return (
    <Stack space="2xs">
      <label htmlFor={`${rootId}-field`} className="visually-hidden">
        {label}
      </label>
      <input
        id={`${rootId}-field`}
        className={field["box"]}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={flat.length > 0}
        aria-controls={flat.length > 0 ? listId : undefined}
        aria-activedescendant={active}
        value={value}
        onChange={(event) => {
          setActiveId(null);
          onValueChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {flat.length > 0 ? (
        <Listbox id={listId} label={label} groups={shown} optionId={optionId} active={active} onSelect={onSelect} />
      ) : null}
      <p role="status" className={styles["status"]}>
        {flat.length > 0 ? "" : "No place matches."}
      </p>
    </Stack>
  );
}
