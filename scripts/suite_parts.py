"""suite_parts.py: what harness_mutate reads of a change and of its two suites: the mutants a change asks for, those
that rewrite a line it changed (select), and a suite's text by section, which a verdict's key stands on (parts).

A section of test_hooks.sh runs from its `if part <name>; then` to the `fi` that closes it, the ifs nested at the
margin counted; one of probe.py from its `if part("<name>"):` to the next line as little indented."""
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


def code(text):
    """Text without its blank lines, which run nothing. Comments stay: a `#` line in a heredoc or a multi-line string is
    text, and telling them apart would take a shell's parser."""
    return "".join(line for line in text.splitlines(keepends=True) if line.strip())


def rewritten(old, new):
    """The lines of `old`, numbered from 1, that `new` differs on, from the first to the last; a line only added touches
    the two beside it."""
    before, after = old.split("\n"), new.split("\n")
    shared = min(len(before), len(after))
    head = 0
    while head < shared and before[head] == after[head]:
        head += 1
    tail = 0
    while tail < shared - head and before[-1 - tail] == after[-1 - tail]:
        tail += 1
    return set(range(head + 1, len(before) - tail + 1)) or {head, head + 1}


def select(found, changed, original):
    """The mutants a change asks for: those that rewrite a line it changed. `changed` holds each changed file's lines on
    HEAD, `original` reads a file. A mutant with no text to place is asked when its file changed."""

    def asked(path, mutated):
        return path in changed and (mutated is None or bool(rewritten(original(path), mutated) & changed[path]))

    return [mutant for mutant in found if asked(mutant[1], mutant[2])]
