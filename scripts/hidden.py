"""hidden.py: the characters no text of this repository holds raw (F5053), as one rule its readers share: check_docs.py
reads every file and the branch's commit messages for them."""
import re
import unicodedata

# A format character (Unicode's category Cf: a bidi control, a zero-width one, a BOM, a tag) shows nothing, or changes how
# the text around it reads: code that reads otherwise than it runs, words a reader never sees but a model does. A text
# that needs one writes it as an escape.
NON_ASCII = re.compile(r"[^\x00-\x7f]")


def hidden_in(where, text):
    """Each format character of text, as `<where>:<line>:<column>: U+<hex> <name>`."""
    out, line, seen = [], 1, 0
    for m in NON_ASCII.finditer(text):
        c = m.group()
        if unicodedata.category(c) != "Cf":
            continue
        line += text.count("\n", seen, m.start())
        seen = m.start()
        column = m.start() - text.rfind("\n", 0, m.start())
        out.append(f"{where}:{line}:{column}: U+{ord(c):04X} {unicodedata.name(c)}")
    return out
