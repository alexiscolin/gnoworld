// The composer's field on Lexical: it shows the formatting in place (italic, not `*word*`), as Slack does, and hands the room the
// same Markdown as before. It stands where the design system's field did: label, placeholder, help and error for a screen
// reader and the box's grid, Enter sends, Shift+Enter adds a line, IME composition never sends half a word (F1713), and
// the suggestions (Suggestions.tsx) open as one types.
import { FieldWords, Listbox } from "@gnoworld/ui";
import type { LexicalEditor } from "lexical";
import { useId } from "react";
import boxStyles from "../MessageBox.module.css";
import rules from "../markdownRules.module.css";
import styles from "./ComposerField.module.css";
import type { Suggestion } from "./suggest.ts";
import { useEditorField, useRoot } from "./useEditorField.ts";
import { useSuggestions } from "./useSuggestions.ts";

/** The classes Lexical draws the marks it has no tag for with. */
export const THEME = {
  text: {
    underline: styles["underline"] ?? "",
    strikethrough: styles["strike"] ?? "",
    underlineStrikethrough: styles["both"] ?? "",
  },
};

export interface ComposerFieldProps {
  editor: LexicalEditor;
  /** The draft: what the editor holds is told by `onChange`; a value that is not what it holds replaces it. */
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  placeholder: string;
  /** Enter adds a line, and the form's button sends: a touch keyboard has no Shift. */
  enterAddsLine: boolean;
  help?: string | undefined;
  error?: string | undefined;
  /** The ids of what else on the page says what the field is about (the reply bar), after its help. */
  describedBy?: string | undefined;
  /** The members' names by address, which a mention taken is drawn with in the field. */
  names: ReadonlyMap<string, string>;
  /** What the word being typed may become, and how one is taken. */
  suggestions: readonly Suggestion[];
  onTake: (item: Suggestion) => void;
}

export function ComposerField(props: ComposerFieldProps) {
  const { editor, value, label, placeholder, help, error, describedBy, suggestions, names, onTake } = props;
  const id = useId();
  const list = `${id}-list`;
  const rootRef = useRoot(editor);
  const caret = useEditorField(editor, { value, onChange: props.onChange, names });
  const { open, active } = useSuggestions(editor, {
    value,
    suggestions,
    caret,
    enterAddsLine: props.enterAddsLine,
    onTake,
  });
  const described = [
    help === undefined ? undefined : `${id}-help`,
    error === undefined ? undefined : `${id}-error`,
    describedBy,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  return (
    <div>
      <label id={`${id}-label`} className="visually-hidden">
        {label}
      </label>
      <div
        ref={rootRef}
        id={id}
        role="textbox"
        contentEditable
        aria-multiline="true"
        aria-labelledby={`${id}-label`}
        aria-describedby={described === "" ? undefined : described}
        aria-invalid={error === undefined ? undefined : true}
        aria-autocomplete="list"
        aria-controls={open ? list : undefined}
        aria-activedescendant={open ? `${list}-${String(active)}` : undefined}
        className={[styles["text"], rules["rules"]].join(" ")}
        spellCheck
      />
      {value === "" ? (
        <span aria-hidden="true" className={styles["placeholder"]}>
          {placeholder}
        </span>
      ) : null}
      <div className={boxStyles["words"]}>
        <FieldWords id={id} label={label} help={help} error={error} />
      </div>
      {open ? (
        <div className={boxStyles["suggestions"]}>
          <Listbox
            label="Suggestions"
            id={list}
            active={active}
            options={suggestions.map((item, at) => ({
              id: `${list}-${String(at)}`,
              label: item.label,
              hint: item.hint,
            }))}
            onPick={(picked) => {
              const item = suggestions.find((_, at) => `${list}-${String(at)}` === picked);
              if (item !== undefined) onTake(item);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
