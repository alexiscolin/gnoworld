"""suite_parts.py: which sections of the harness's two suites a change touched, so harness_mutate --changed judges
the mutants those sections test, not all of them (about 660, twenty minutes) whenever a suite changed at all.

A section of test_hooks.sh runs from its `if part <name>; then` to the `fi` that closes it, the ifs nested at the
margin counted; one of probe.py from its `if part("<name>"):` to the next line as little indented. A change outside
every section (a helper, a fixture, the preamble) may reach any section: it touches them all."""
import re

SH_START = re.compile(r"^if part (\w+); then$")
PY_START = re.compile(r'^(\s*)if part\("(\w+)"\):')


def parts(path, text):
    """The suite's sections by name (one named twice holds both blocks), and its text outside them."""
    sh = path.endswith(".sh")
    found, outside, name, depth = {}, [], None, 0
    for line in text.splitlines(keepends=True):
        bare = line.rstrip("\n")
        if name is not None and not sh and bare.strip() and len(bare) - len(bare.lstrip()) <= depth:
            name = None
        if name is None:
            start = (SH_START if sh else PY_START).match(bare)
            if start is None:
                outside.append(line)
                continue
            name, depth = (start.group(1), 1) if sh else (start.group(2), len(start.group(1)))
            found[name] = found.get(name, "") + line
            continue
        found[name] += line
        if sh and re.match(r"if\b", bare) and not re.search(r"\bfi$", bare):
            depth += 1
        elif sh and bare == "fi":
            depth -= 1
            name = None if depth == 0 else name
    return found, "".join(outside)


def touched(path, old, new):
    """The sections whose text differs, a new or a gone one included; None when text outside every section changed,
    which may reach any of them."""
    (old_parts, old_outside), (new_parts, new_outside) = parts(path, old), parts(path, new)
    if old_outside != new_outside:
        return None
    return {name for name in old_parts.keys() | new_parts.keys() if old_parts.get(name) != new_parts.get(name)}


def select(found, changed, touched_by_suite, sections):
    """The mutants a change asks for: those of the guard files it changed, and those whose sections of their suite
    it touched; a suite touched outside its sections (None) asks for all of its mutants."""

    def asked(path, test):
        if path in changed:
            return True
        touched_here = touched_by_suite.get(test, set())
        return touched_here is None or bool(set(sections(path, test).split(",")) & touched_here)

    return [mutant for mutant in found if asked(mutant[1], mutant[3])]
