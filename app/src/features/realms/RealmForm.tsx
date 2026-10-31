// A realm page's form, drawn to be read and nothing else (5h): gnoweb's `<gno-form>` is a way to send a transaction, and
// a page we do not control must not look like one. So no control is drawn, no `<form>`, input, button or select: each
// field is a name and what the page said of it, every attribute in view, a hidden field too, marked as hidden. Every
// string is React's text.
import type { FormField } from "@gnoworld/core";
import { createElement, type ReactNode } from "react";
import edge from "./frame.module.css";
import styles from "./RealmBlocks.module.css";

// What a field says besides its name, each part labelled: nothing the page wrote about it stays out of sight.
function details(field: FormField): ReactNode[] {
  const parts: [string, string][] = [
    ["type", field.inputType],
    ["value", field.value],
    ["placeholder", field.placeholder],
    ["description", field.description],
  ];
  return parts
    .filter(([, value]) => value !== "")
    .map(([label, value]) =>
      createElement(
        "span",
        { key: label, className: styles["detail"] },
        `${label}: `,
        createElement("code", null, value),
      ),
    );
}

function fieldRow(field: FormField, at: number): ReactNode[] {
  const kind = field.tag === "other" ? "not a field" : field.tag;
  const name = field.tag === "other" ? "" : field.name === "" ? "(no name)" : field.name;
  return [
    createElement(
      "dt",
      { key: `t${String(at)}` },
      name,
      createElement("small", { className: styles["kind"] }, ` ${kind}`),
    ),
    createElement("dd", { key: `d${String(at)}` }, ...details(field)),
  ];
}

/** A form as a read-only list of its fields, under a line that says nothing here sends anything. */
export function RealmForm({ exec, fields }: { exec: string; fields: readonly FormField[] }) {
  return createElement(
    "figure",
    { className: [edge["frame"], styles["form"]].join(" "), "data-block": "form" },
    createElement(
      "figcaption",
      null,
      exec === "" ? "Form" : `Form: ${exec}`,
      createElement("small", { className: styles["kind"] }, " read only, nothing here sends anything"),
    ),
    createElement("dl", null, ...fields.flatMap(fieldRow)),
  );
}
