// A realm page's form, drawn to be read and nothing else (5h): gnoweb's `<gno-form>` is a way to send a transaction, and
// a page we do not control must not look like one. So no control is drawn, no `<form>`, input, button or select: each
// field is a name and what the page said of it, every attribute in view, a hidden field too, marked as hidden. Every
// string is React's text, set left to right: a name or a value cannot read backwards (F786).
import { isBlank, type FormField } from "@gnoworld/core";
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
    ["flags", field.flags],
  ];
  return parts
    .filter(([, value]) => value !== "")
    .map(([label, value]) =>
      createElement(
        "span",
        { key: label, className: styles["detail"] },
        `${label}: `,
        createElement("code", { dir: "ltr" }, value),
      ),
    );
}

function fieldRow(field: FormField, at: number): ReactNode[] {
  const kind = field.tag === "other" ? "not a field" : field.tag;
  const name = field.tag === "other" ? "" : isBlank(field.name) ? "(no name)" : field.name;
  return [
    createElement(
      "dt",
      { key: `t${String(at)}`, dir: "ltr" },
      name,
      createElement("small", { className: styles["kind"] }, ` ${kind}`),
    ),
    createElement("dd", { key: `d${String(at)}` }, ...details(field)),
  ];
}

/** The line a form says of the fields left out of its list: how many, so a hidden one among them is not a silent loss. */
const leftOut = (left: number): string =>
  `${String(left)} more field${left === 1 ? " is" : "s are"} not shown here, a hidden one may be among them.`;

// What a form says it is when nothing about it can be called.
const READ_ONLY = "read only, nothing here sends anything";

/** A form as a list of its fields, to be read, under a line that says what it is: by default that nothing here sends anything
 * (`note`). A form a call was confirmed for (CallableForm, ActionForm) says so, and brings its Call and card as `children`;
 * `left` fields were not drawn, which the form says. */
export function RealmForm({
  exec,
  path,
  fields,
  left,
  note = READ_ONLY,
  children,
}: {
  exec: string;
  path: string;
  fields: readonly FormField[];
  left: number;
  note?: string;
  children?: ReactNode;
}) {
  return createElement(
    "figure",
    { className: [edge["frame"], styles["form"]].join(" "), "data-block": "form" },
    createElement(
      "figcaption",
      { dir: "ltr" },
      exec === "" ? "Form" : `Form: ${exec}`,
      path === "" ? undefined : createElement("small", { className: styles["kind"] }, ` · path: ${path}`),
      createElement("small", { className: styles["kind"] }, ` · ${note}`),
    ),
    createElement("dl", null, ...fields.flatMap(fieldRow)),
    left === 0 ? undefined : createElement("p", { className: styles["kind"], "data-left": "" }, leftOut(left)),
    children,
  );
}
