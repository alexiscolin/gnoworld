"""check_css.py: the CSS rules no linter holds (docs/DESIGN-SYSTEM.md, "CSS rules").

- Layout lives in compositions: a block's module uses no flex or grid display, gap, flex,
  grid, justify, align, place, float, columns or margin, unless a `/* layout: why */` comment
  sits right before the declaration.
- Values come from tokens, in every stylesheet but tokens.css: no hex, functional or named
  colour, no length or duration with a unit (var() fallbacks and --_private properties
  included), no bare z-index, unless a `/* raw: why */` comment sits right before it.
- One token file. Its primitives, `--p-*`, are the only raw colours: a semantic token is made
  of them, and nothing else reads one, in a stylesheet or named in code (tests aside).
- Every `var(--x)` names a token (or a `--_private` property of its own module), and every
  token is used somewhere. Every class of a module is used by a component in its folder, and
  every class a component names (`styles.x`, `styles["x"]`) is in the module it imports, named
  statically; every `[data-x]` a module styles is an attribute a component of its folder sets.
- No ID selector, no `transition: all`, and no two modules sharing three identical declarations.
Strings and comments are blanked before parsing, so a brace in a string hides nothing.
scripts/probe.py plants each fault. Usage: check_css.py [root]"""
import collections
import itertools
import pathlib
import re
import sys

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # -I leaves this folder off the path
from repo_files import listed

LAYOUT = re.compile(r"^(gap|row-gap|column-gap|flex(-[\w-]+)?|grid(-[\w-]+)?|justify-[\w-]+|align-[\w-]+|place-[\w-]+|margin(-[\w-]+)?|float|columns|column-(count|width))$")
DISPLAY = re.compile(r"\b(inline-)?(flex|grid)\b", re.I)
UNIT = r"px|rem|em|ex|ch|pt|pc|cm|mm|in|q|vh|vw|vmin|vmax|vi|vb|svh|lvh|dvh|ms|s"
# ponytail: common colour names only; the full CSS list of 148 if one ever slips through.
NAMED = r"black|white|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|gold|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta|brown|indigo|violet|beige|coral|crimson|salmon|tomato|khaki"
RAW = re.compile(rf"#[0-9a-fA-F]{{3,8}}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w.-])\d*\.?\d+({UNIT})\b|\b({NAMED})\b", re.I)
COLOUR = re.compile(rf"#[0-9a-fA-F]{{3,8}}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b({NAMED})\b", re.I)
PRIMITIVE = re.compile(r"--p-[\w-]+$")


def parse(text):
    """The rule blocks of a stylesheet, nested ones included: (selector, [(prop, value, marks)])."""
    text = re.sub(r"/\*\s*(layout|raw):.*?\*/", r" @@\1@@ ", text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', text)
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
    """Adds one `prop: value` to a block, with the layout or raw marks its comment gave it."""
    marks = set(re.findall(r"@@(layout|raw)@@", raw))
    raw = re.sub(r"@@\w+@@", "", raw).strip()
    if ":" in raw and not raw.startswith("@"):
        prop, value = (part.strip() for part in raw.split(":", 1))
        block.append((prop.lower(), value, marks))


def classes_of(blocks):
    return {c for selector, _ in blocks for c in re.findall(r"\.([A-Za-z_][\w-]*)", selector)}


def module_uses(path, text):
    """Each CSS module a code file imports, with the classes it names and its unchecked uses."""
    code = re.sub(r"/\*.*?\*/|(?<![:\"'`])//[^\n]*", " ", text, flags=re.S)
    for binding, source in re.findall(r"import\s+(\w+)\s+from\s+[\"'](\.{1,2}/[^\"']+\.module\.css)[\"']", code):
        at = rf"(?<![\w$.]){re.escape(binding)}"
        named = re.findall(rf"{at}\.([A-Za-z_$][\w$]*)", code) + [m[1] for m in re.findall(rf"{at}\[\s*([\"'`])([\w-]+)\1\s*\]", code)]
        computed = re.findall(rf"{at}\[(?!\s*([\"'`])[\w-]+\1\s*\])", code)
        destructured = re.findall(rf"\}}\s*=\s*{re.escape(binding)}\b", code)
        yield (path.parent / source).resolve(), named, bool(computed), bool(destructured)


root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
texts = {p: p.read_text() for p in listed(root, {".css", ".ts", ".tsx"})}
sheets = {p: parse(t) for p, t in texts.items() if p.suffix == ".css"}
code_by_folder = collections.defaultdict(str)
for p, t in texts.items():
    if p.suffix != ".css":
        code_by_folder[p.parent] += t + "\n"
token_files = [p for p in sheets if p.name == "tokens.css"]
tokens = {t for p in token_files for t in re.findall(r"(--[\w-]+)\s*:", texts[p])}
problems, exceptions, used = [], 0, set()
if len(token_files) > 1:
    problems.append(f"a second token file: {', '.join(map(str, token_files))}; tokens.css is the one list")

for p, blocks in sheets.items():
    own = set(re.findall(r"(--_[\w-]+)\s*:", texts[p]))
    for name in re.findall(r"var\(\s*(--[\w-]+)", texts[p]):
        used.add(name)
        if name not in tokens and name not in own:
            problems.append(f"{p}: unknown token {name}")
        if PRIMITIVE.match(name) and p.name != "tokens.css":
            problems.append(f"{p}: the primitive {name} read outside the token file; read its semantic token")
    module, composition = p.name.endswith(".module.css"), "compositions" in p.parts
    for selector, decls in blocks:
        if re.search(r"(^|[\s,>+~(])#[\w-]", selector):
            problems.append(f"{p}: an ID selector ({selector}); style a class")
        for prop, value, marks in decls:
            if prop in ("transition", "transition-property") and re.search(r"\ball\b", value, re.I):
                problems.append(f"{p}: transition: all; name the properties")
            layout = bool(LAYOUT.match(prop)) or (prop == "display" and bool(DISPLAY.search(value)))
            if module and layout and not composition:
                if "layout" in marks:
                    exceptions += 1
                else:
                    problems.append(f"{p}: layout in a block ({prop}: {value}); use a composition, or say why with /* layout: … */")
            bare = re.sub(r"var\(\s*--[\w-]+\s*,?", "(", value)  # a fallback stays visible
            raw = bool(RAW.search(bare)) or (prop == "z-index" and value.lstrip("-").isdigit())
            if raw and "raw" not in marks and p.name != "tokens.css" and (not prop.startswith("--") or prop.startswith("--_")):
                problems.append(f"{p}: raw value ({prop}: {value}); use a token, or say why with /* raw: … */")
            if p.name == "tokens.css" and prop.startswith("--") and not PRIMITIVE.match(prop) and COLOUR.search(bare):
                problems.append(f"{p}: {prop} holds a raw colour ({value}); a semantic token is made of primitives")
    if module:
        for name in classes_of(blocks):
            camel = re.sub(r"-(\w)", lambda m: m.group(1).upper(), name)
            if not re.search(rf"\b({re.escape(name)}|{re.escape(camel)})\b", code_by_folder[p.parent]):
                problems.append(f"{p}: unused class .{name}")
        for attribute in {a for selector, _ in blocks for a in re.findall(r"\[(data-[\w-]+)", selector)}:
            if not re.search(rf"\b{re.escape(attribute)}=|[\"']{re.escape(attribute)}[\"']\s*:", code_by_folder[p.parent]):
                problems.append(f"{p}: [{attribute}] is a state no component sets in its folder")

module_classes = {p.resolve(): classes_of(blocks) for p, blocks in sheets.items() if p.name.endswith(".module.css")}
for p, text in texts.items():
    if p.suffix == ".css":
        continue
    for source, named, computed, destructured in module_uses(p, text):
        missing = sorted(set(named) - module_classes.get(source, set()))
        if missing:
            problems.append(f"{p}: missing class {', '.join(missing)} in {source.name}")
        if computed:
            problems.append(f"{p}: a computed class of {source.name}; name each class, so a missing one is seen")
        if destructured:
            problems.append(f"{p}: {source.name} destructured; name each class from the module")
    quoted = re.findall(r"['\"`](--[\w-]+)", text)
    used.update(quoted)
    if ".test." not in p.name:
        problems += [f"{p}: the primitive {name} named outside the token file; name its semantic token" for name in quoted if PRIMITIVE.match(name)]
problems += [f"unused token {t}" for t in sorted(tokens - used)]

# ponytail: compares every pair of blocks across modules; an index by declaration if it gets slow.
flat = [(p, frozenset((d[0], d[1]) for d in decls)) for p, blocks in sheets.items() if p.name.endswith(".module.css") for _, decls in blocks]
for (a, da), (b, db) in itertools.combinations(flat, 2):
    if a != b and len(da & db) >= 3:
        problems.append(f"{a} and {b}: copied rules ({len(da & db)} declarations alike); make a composition, a utility or a composes")

print(f"check_css: {sum(p.name.endswith('.module.css') for p in sheets)} modules, layout exceptions: {exceptions}")
if problems:
    print(*problems, sep="\n", file=sys.stderr)
    sys.exit(1)
