"""hidden.py: the characters no text of this repository holds raw (F5053), as one rule its readers share: check_docs.py
reads every file and the branch's commit messages for them."""
import re
import unicodedata

# What shows nothing, or changes how the text around it reads: code that reads otherwise than it runs, words a reader never
# sees but a model does (F5053). Unicode's Default_Ignorable_Code_Point (the zero-width characters, the variation
# selectors, the Hangul fillers, the tags and the rest of their block), the format characters (Cf: the bidi controls, the
# BOM) and the line and paragraph separators (Zl, Zp: each ends a `//` comment in TypeScript), as Node 24.22.0's ICU 78.3
# gives them. A table, so that every Python gives one verdict, whatever Unicode it knows (F5083, F5086); section check_docs
# holds it to the pinned Node's, range by range. A text that needs one writes it as an escape.
UNICODE = "17.0"
TABLE = (
    (0x00AD, 0x00AD), (0x034F, 0x034F), (0x0600, 0x0605), (0x061C, 0x061C), (0x06DD, 0x06DD), (0x070F, 0x070F),
    (0x0890, 0x0891), (0x08E2, 0x08E2), (0x115F, 0x1160), (0x17B4, 0x17B5), (0x180B, 0x180F), (0x200B, 0x200F),
    (0x2028, 0x202E), (0x2060, 0x206F), (0x3164, 0x3164), (0xFE00, 0xFE0F), (0xFEFF, 0xFEFF), (0xFFA0, 0xFFA0),
    (0xFFF0, 0xFFFB), (0x110BD, 0x110BD), (0x110CD, 0x110CD), (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A),
    (0xE0000, 0xE0FFF),
)
HIDDEN = re.compile("[" + "".join(f"{chr(a)}-{chr(b)}" for a, b in TABLE) + "]")
# U+FE0E and U+FE0F pick an emoji's look, as text or as a picture. One is kept right after a character that shows and is no
# ASCII, or in a keycap (`1`, U+FE0F, U+20E3); any other, a second in a row included, can carry hidden bits (F5086).
LOOKS = (0xFE0E, 0xFE0F)
KEYCAP = re.compile("[0-9#*]" + chr(0xFE0F) + chr(0x20E3))


def picks_a_look(text, i):
    """Whether the selector at text[i] picks the look of the character it follows."""
    return i > 0 and ((not text[i - 1].isascii() and not HIDDEN.match(text[i - 1])) or KEYCAP.match(text, i - 1) is not None)


def hidden_in(where, text):
    """Each hidden character of text, as `<where>:<line>:<column>: U+<hex> <name>` (no name for one this Python does not
    know)."""
    out, line, seen = [], 1, 0
    for m in HIDDEN.finditer(text):
        c = m.group()
        if ord(c) in LOOKS and picks_a_look(text, m.start()):
            continue
        line += text.count("\n", seen, m.start())
        seen = m.start()
        column = m.start() - text.rfind("\n", 0, m.start())
        name = unicodedata.name(c, "")
        out.append(f"{where}:{line}:{column}: U+{ord(c):04X}{' ' + name if name else ''}")
    return out
