"""machine_rules.py <settings.json's text> <main checkout> [<profile folder>...]: the twins of .claude/settings.json's rules on this
machine (D13413). A relative rule guards a session's own tree alone, while its tools reach further: the main checkout from a worktree
session (the file tools, and its shell through git's shared folder), every worktree and their folder from the chief's (its --add-dir of
that folder), and the temporary folder from every shell. Those folders are each machine's, so the committed file names none, and
install_hooks.sh writes these into every Claude profile's user settings, each a list that adds to the project's (D13414 keeps the
seven rules above the main checkout out: no session writes there). With no profile named, it prints them as JSON."""
import datetime
import json
import os
import re
import shutil
import sys
import tempfile

INSTRUCTIONS = ("CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", ".claude/rules", "AGENTS.md", ".claude/AGENTS.md")
# Alexis's unlock (2026-11-06): a worktree's harness, rules and configs are open to its session; the twins keep the gate's own hooks,
# the guard, the secret scan, the dependency files, git's folder and the instructions alone. The main checkout keeps everything.
KEPT = ("**/.claude/skills", "**/CLAUDE.local.md", ".git/hooks", ".git/config", ".git/commondir", ".githooks/pre-commit",
        ".githooks/pre-push", ".githooks/records.sh", ".mcp.json", ".node-version", ".npmrc", ".pnpmfile.cjs", ".pnpmfile.mjs",
        "CLAUDE.local.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "scripts/.gitleaksignore",
        "scripts/gitleaks-private.toml", "scripts/gitleaks.toml", "scripts/guard.py", "scripts/install_hooks.sh",
        "scripts/scan_secrets.sh", "scripts/worktree.sh")
OPENED = ("/.githooks/**", "/.claude/agents/**", "/.claude/commands/**", "/.claude/workflows/**", "/.claude/rules/**",
          "/**/.claude/rules/**", "/scripts/stop_gate.sh", "/scripts/borrow_node_modules.sh", "/scripts/check.sh",
          "/scripts/check_docs.py", "/scripts/ergo.sh", "/scripts/hidden.py", "/scripts/related.py", "/scripts/speeds.py",
          "/scripts/workshop.sb", "/scripts/workshop.sh", "/tools/agent-github/**")


def rules(settings, main, home, uid):
    """{"deny": [...], "denyWrite": [...]}: the twins of settings' relative Read and Edit rules under the main checkout (all of them) and
    under each worktree (those the unlock keeps), the instructions in the worktrees' folder ("<main>-wt", D13415) and in the uid's
    temporary folder, by both its spellings."""
    short = lambda p: "~" + p[len(home):] if p.startswith(home + "/") else p  # the form a person writes, and today's rules were
    rule = lambda p: p if p.startswith("~") else "/" + p  # a permission rule's absolute path starts with //
    main, new, tmp = short(main), short(main + "-wt"), f"/private/tmp/claude-{uid}"
    own = [(m[1], m[2]) for r in settings["permissions"]["deny"] if (m := re.fullmatch(r"(Read|Edit)\((/[^/].*)\)", r))]
    twins = [(k, p) for k, p in own if p not in OPENED] + [("Edit", f"/.githooks/{h}") for h in ("pre-commit", "pre-push", "records.sh")]
    deny = {f"{k}({rule(main)}{p})" for k, p in own} | {f"Edit({rule(main)}/scripts/**)"}
    deny |= {f"{k}({rule(new)}/*{p})" for k, p in twins} | {f"Edit({rule(new)}/*/.git)", f"Edit({rule(new)}/.claude/**)"}
    named = lambda n: f"{n}/**" if n == ".claude/rules" else n
    deny |= {f"Edit({rule(f)}/{named(n)})" for f in (new, tmp, "/tmp" + tmp[len("/private/tmp"):]) for n in INSTRUCTIONS}
    writes = {f"{tmp}/{n}" for n in INSTRUCTIONS} | {f"{new}/{n}" for n in INSTRUCTIONS} | {f"{new}/.claude", f"{new}/*/.git"}
    writes |= {f"{new}/*/{w}" for w in KEPT}
    return {"deny": sorted(deny), "denyWrite": sorted(writes)}


def write(profile, wanted):
    """Adds to the profile's settings what wanted holds and they lack, a copy of the file as it was kept beside; never removes or
    changes an entry. A settings file that is a link or no JSON is left as it is, said."""
    path = os.path.join(profile, "settings.json")
    if os.path.islink(path):
        return "a link, left as it is: add this machine's rules where it leads by hand"
    try:
        with open(path) as f:
            s = json.load(f)
    except ValueError:
        return "not JSON, left as it is"
    lists = (s.setdefault("permissions", {}).setdefault("deny", []), s.setdefault("sandbox", {}).setdefault("filesystem", {}).setdefault("denyWrite", []))
    added = [(lst, x) for lst, key in zip(lists, ("deny", "denyWrite")) for x in wanted[key] if x not in lst]
    if added:
        shutil.copyfile(path, f"{path}.bak-install-hooks-{datetime.datetime.now():%Y%m%d%H%M%S}")
        for lst, x in added:
            lst.append(x)
        fd, tmp = tempfile.mkstemp(dir=profile, prefix=".settings.")
        with os.fdopen(fd, "w") as f:
            json.dump(s, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    return f"{len(added)} rule(s) of this machine's folders added (D13413)"


if __name__ == "__main__":
    wanted = rules(json.loads(sys.argv[1]), sys.argv[2], os.path.expanduser("~"), os.getuid())
    if len(sys.argv) == 3:
        print(json.dumps(wanted, indent=1))
    for profile in sys.argv[3:]:
        print(f"install_hooks: {profile}: {write(profile, wanted)}")
