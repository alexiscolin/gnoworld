// A realm's write function as gno's `vm/qfuncs` writes it (D70): its first parameter's type is the realm type's base,
// printed at gno's tag chain/onyx. The cards' tests and the entry's share it.
export const REALM_TYPE = [
  "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool;",
  "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string;",
  "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
].join(" ");
