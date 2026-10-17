"""check_css.py: the CSS rules no linter holds (docs/DESIGN-SYSTEM.md, "CSS rules").

- Layout lives in compositions: a block's module may not use display flex or grid, gap,
  the flex, grid, justify, align and place properties, or margins, unless a
  `/* layout: why */` comment sits right before the declaration.
- Values come from tokens: no hex or functional colour, no length or duration with a unit,
  no bare z-index, unless a `/* raw: why */` comment sits right before it.
- Every `var(--x)` names a token (or a `--_private` property of its own module), and every
  token is used somewhere.
- Every class of a module is used by a component in its folder.
- No two modules share three or more identical declarations.
scripts/probe.py plants each fault. Usage: check_css.py [root]"""
import itertools
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import listed

LAYOUT = re.compile(r"^(gap|row-gap|column-gap|flex(-[\w-]+)?|grid(-[\w-]+)?|justify-[\w-]+|align-[\w-]+|place-[\w-]+|margin(-[\w-]+)?)$")
DISPLAY = re.compile(r"^(inline-)?(flex|grid)$")
RAW = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|(?<![\w.-])\d*\.?\d+(px|rem|em|ms|s)\b")
SKIP = {"docs"}  # besides .gitignore: the frozen prototype


def parse(text):
    """The rule blocks of a stylesheet, nested ones included: (selector, [(prop, value, marks)])."""
    text = re.sub(r"/\*\s*(layout|raw):.*?\*/", r" @@\1@@ ", text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    stack, done, buf = [("", [])], [], ""
    for ch in text:
        if ch in "{};":
            if ch != "{":
                declare(stack[-1][1], buf)
            if ch == "{":
                stack.append((buf.strip(), []))
            elif ch == "}" and len(stack) > 1:
                done.append(stack.pop())
            buf = ""
        else:
            buf += ch
    return done


def declare(block, raw):
    marks = set(re.findall(r"@@(layout|raw)@@", raw))
    raw = re.sub(r"@@\w+@@", "", raw).strip()
    if ":" in raw and not raw.startswith("@"):
        prop, value = (part.strip() for part in raw.split(":", 1))
        block.append((prop.lower(), value, marks))


root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
sheets = {p: parse(p.read_text()) for p in listed(root, {".css"}, SKIP)}
code = {p: p.read_text() for p in listed(root, {".ts", ".tsx"}, SKIP)}
tokens = {t for p in sheets if p.name == "tokens.css" for t in re.findall(r"(--[\w-]+)\s*:", p.read_text())}
problems, exceptions = [], 0

used = set()
for p, blocks in sheets.items():
    text = p.read_text()
    own = set(re.findall(r"(--_[\w-]+)\s*:", text))
    for name in re.findall(r"var\(\s*(--[\w-]+)", text):
        used.add(name)
        if name not in tokens and name not in own:
            problems.append(f"{p}: unknown token {name}")
for text in code.values():
    used.update(re.findall(r"['\"`](--[\w-]+)", text))
problems += [f"unused token {t}" for t in sorted(tokens - used)]

modules = {p: b for p, b in sheets.items() if p.name.endswith(".module.css")}
for p, blocks in modules.items():
    composition = "compositions" in p.parts
    for selector, decls in blocks:
        for prop, value, marks in decls:
            layout = bool(LAYOUT.match(prop)) or (prop == "display" and bool(DISPLAY.match(value)))
            if layout and not composition:
                if "layout" in marks:
                    exceptions += 1
                else:
                    problems.append(f"{p}: layout in a block ({prop}: {value}); use a composition, or say why with /* layout: … */")
            raw = bool(RAW.search(re.sub(r"var\([^)]*\)", "", value))) or (prop == "z-index" and value.isdigit())
            if raw and "raw" not in marks and not prop.startswith("--"):
                problems.append(f"{p}: raw value ({prop}: {value}); use a token, or say why with /* raw: … */")
    beside = " ".join(text for c, text in code.items() if c.parent == p.parent)
    for name in {c for selector, _ in blocks for c in re.findall(r"\.([A-Za-z_][\w-]*)", selector)}:
        camel = re.sub(r"-(\w)", lambda m: m.group(1).upper(), name)
        if not re.search(rf"\b({re.escape(name)}|{re.escape(camel)})\b", beside):
            problems.append(f"{p}: unused class .{name}")

# ponytail: compares every pair of blocks across modules; an index by declaration if it gets slow.
flat = [(p, frozenset((d[0], d[1]) for d in decls)) for p, blocks in modules.items() for _, decls in blocks]
for (a, da), (b, db) in itertools.combinations(flat, 2):
    if a != b and len(da & db) >= 3:
        problems.append(f"{a} and {b}: copied rules ({len(da & db)} declarations alike); make a composition, a utility or a composes")

print(f"check_css: {len(modules)} modules, layout exceptions: {exceptions}")
if problems:
    print(*problems, sep="\n", file=sys.stderr)
    sys.exit(1)
