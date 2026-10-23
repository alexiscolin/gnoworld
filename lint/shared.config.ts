// What the lint config's parts share (eslint.config.ts composes them).
// An error swallowed: a catch, or a promise's .catch, that only logs, returns nothing or does
// nothing. Shared, since a later block's no-restricted-syntax replaces an earlier one's.
const LOG =
  "CallExpression:matches([callee.object.name=/^(console|logger)$/], [callee.object.property.name=/^(console|logger)$/])";
export const SWALLOWED = [
  {
    selector: `CatchClause > BlockStatement[body.length=1] > ExpressionStatement > ${LOG}`,
    message: "A catch that only logs swallows the error: act on it, or let it rise.",
  },
  {
    // esquery's :has never matches a relative selector of two steps (`:has(> A > B)`).
    selector: `CatchClause > BlockStatement[body.length=2] > ExpressionStatement:first-child:has(> ${LOG}) + ReturnStatement`,
    message: "A catch that logs, then returns a default, swallows the error: act on it, or let it rise.",
  },
  {
    selector:
      "CallExpression[callee.property.name='catch'] > :function[body.type='BlockStatement'][body.body.length=0]",
    message: "An empty .catch swallows the error.",
  },
  {
    selector:
      "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='Identifier'][body.name='undefined']",
    message: "A .catch that returns undefined swallows the error.",
  },
  {
    selector: `CallExpression[callee.property.name='catch'] > ArrowFunctionExpression > ${LOG}.body`,
    message: "A .catch that only logs swallows the error.",
  },
];
// No test is switched off or focused, so none stops guarding quietly (CLAUDE.md, "No regression").
export const SWITCHED_OFF = {
  // Vitest's and Playwright's ways: skip, focus, leave for later, run on a condition, expect to fail.
  selector:
    "MemberExpression[property.name=/^(only|skip|todo|skipIf|runIf|fixme)$/], MemberExpression[property.name='fail']:not([object.name=/^(expect|assert)$/])",
  message: "A test is never switched off or focused: fix it, or remove it with `Removed-test:` in the commit.",
};
// No Map, WeakMap or Set made at a module's top in a workspace's source, nor inside what a top-level name holds:
// it lives as long as the process, every test shares it, and StrykerJS ignores the code that builds it (F412).
// Kept by name: two constant tables, FORMS and DIRECTIONAL, and lookups, one entry per database.
const KEPT = "FORMS|DIRECTIONAL|lookups";
const NAMED = `VariableDeclaration > VariableDeclarator[id.name!=/^(${KEPT})$/]`;
const MADE = "NewExpression[callee.name=/^(Weak)?(Map|Set)$/]:not(:function NewExpression)";
export const MODULE_STATE = {
  selector: `Program > ${NAMED} ${MADE}, Program > ExportNamedDeclaration > ${NAMED} ${MADE}`,
  message:
    "A Map, WeakMap or Set at a module's top lives as long as the process, shared by every test: make it in a function (F412).",
};
// Vitest's tests and Playwright's journeys.
export const TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"];
