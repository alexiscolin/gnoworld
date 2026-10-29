# Slice 5, its second branch: the harness's speed

Alexis, 2026-10-29 (`docs/decisions.md`): the harness's speed and scale before any of slice 5's features, without
weakening its security. Branch `slice-5-speed`, on `slice-5-cleanup`. No product code.

## Done when

1. `harness_mutate.py --changed`, when the script itself changed, judges only the mutants it defines anew or otherwise
   than base's (label, file, suite, the text written), with those of the changed guard files and sections; every
   mutant when base's script cannot say its own.
2. `check.sh --merge` skips the stories, the coverage lane and `prove_fix` when nothing but docs, the harness and the
   lint changed since main, and says so; `--full` never skips. StrykerJS reads one incremental file every tree shares.
3. The Stop hook stops, at each turn's end, a process of this project whose parent is gone (unless a gate runs and it
   is under 2 hours old), or a test tool's over 3 hours old, and logs it; nothing else.
4. Measured: the merge check of `slice-5-cleanup` before and after, the same tree and the same work, both times shown.

## Out of scope

Running the full gate's mutants on the CI instead of locally (a change to F076's local record): proposed to Alexis
with its numbers once 4 is measured.

## Threat model

A product change read as "no product" would skip its coverage and mutants until `--full`: any path outside the listed
folders is product; `--full` and the CI judge all. A mutant judged as unchanged when it changed would hide a weakened
guard: it is told by the text it writes, and an unreadable base judges all. The hook runs with Alexis's rights: it stops
only processes whose command names this project, and never a young orphan while a gate runs.

## Tests

`test_hooks.sh`: `harness_shards` (a comment, a new mutant, a changed one, an unreadable base), `gate_full` (a branch
with no product code, each kind of product path, the shared cache), `stop_gate` (a fake ps over real sleeping
processes); each new guard's mutant.
