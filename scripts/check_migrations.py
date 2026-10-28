"""check_migrations.py: a migration main has keeps its text and its place (F466).

The server applies its migrations by index (server/src/db.ts): one edited in place, moved or removed never
reaches a database made before it. Each migration server/src/main.ts lists at the base must stand in the
working tree (what the gate tests) in the same place (main.ts's list, or the one it imports from
server/src/migrations.ts), its text the same; new ones may follow. What it cannot
read (the list in another shape, a migration not a plain template literal) is refused, never passed over.
Usage: check_migrations.py <base>, from the repository root (check.sh --full)."""
import pathlib
import re
import subprocess
import sys

MAIN = "server/src/main.ts"
LIST = re.compile(r"openDatabase\(config\.database, \[([^\]]*)\]")
# Or main.ts opens it with the list server/src/migrations.ts exports (SV2), imported from there alone.
HELD = "server/src/migrations.ts"
NAMED = re.compile(r'^import \{ migrations \} from "\./migrations\.ts";$[\s\S]*openDatabase\(config\.database, migrations\)', re.M)
HELD_LIST = re.compile(r"export const migrations: readonly string\[\] = \[([^\]]*)\]")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True)


def listed(read, holders):
    """The (name, text) of each migration main.ts lists, in order; none before the server opened its database."""
    main = read(MAIN)
    if main is None or "openDatabase(" not in main:
        return []
    found = LIST.search(main)
    if found is None and NAMED.search(main):
        found = HELD_LIST.search(read(HELD) or "")
    if found is None or not re.fullmatch(r"[\w\s,]*", found.group(1)):
        sys.exit(f"check_migrations: {MAIN}'s openDatabase list cannot be read: name each migration's constant")
    out = []
    for name in re.findall(r"\w+", found.group(1)):
        texts = [m.group(1) for text in holders(name) for m in re.finditer(rf"export const {name} = `([^`]*)`", text)]
        if len(texts) != 1 or "${" in texts[0] or "\\" in texts[0]:
            sys.exit(f"check_migrations: {name} is not one plain template literal in server/src (found {len(texts)})")
        out.append((name, texts[0]))
    return out


def at_base(base):
    """The base's main.ts, and the files of its server/src that export a name."""
    def read(path):
        shown = git("show", f"{base}:{path}")
        return shown.stdout if shown.returncode == 0 else None

    def holders(name):
        hits = git("grep", "-l", "-F", "-e", f"export const {name} =", base, "--", "server/src").stdout.split()
        return [git("show", hit).stdout for hit in hits]

    return read, holders


def here(path):
    p = pathlib.Path(path)
    return p.read_text() if p.is_file() else None


def held_here(name):
    return [text for p in sorted(pathlib.Path("server/src").rglob("*.ts")) if f"export const {name} =" in (text := p.read_text())]


base = sys.argv[1]
if git("rev-parse", "--verify", "--quiet", f"{base}^{{commit}}").returncode != 0:
    sys.exit(f"check_migrations: {base} is no commit")
before, after = listed(*at_base(base)), listed(here, held_here)
changed = [name for i, (name, text) in enumerate(before) if i >= len(after) or after[i][1] != text]
if changed:
    sys.exit(f"check_migrations: main's migrations changed, moved or removed: {', '.join(changed)}. A migration on"
             " main keeps its text and its place (server/src/db.ts): add a new one after the others (F466)")
