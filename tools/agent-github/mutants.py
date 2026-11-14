"""Each guard of agent-pr and of its hook switched off, one at a time: test.sh must fail on every one.
Usage: python3 -I mutants.py, from anywhere; it reads and copies the files beside it, and writes only under $TMPDIR."""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

here = pathlib.Path(__file__).resolve().parent
H, G = "agent-pr", "agent_pr_guard.py"
MUTANTS = [
    (H, [("#!/usr/bin/env -S -i LC_ALL=C", "#!/usr/bin/env -S LC_ALL=C")], "the environment is emptied"),
    (H, [("    if not (OWNER.fullmatch(owner) and NAME.fullmatch(name)) or name.endswith(\".git\") or \"..\" in name:", "    if not owner or not name:")], "the repository is owner/name"),
    (H, [("or name.endswith(\".git\") or", "or")], "no name ending .git"),
    (H, [("    if arg not in allowed:", "    if False:")], "only a repository on the allow list"),
    (H, [("        raise Refused(f\"no allow list at {STATE}/repos.allow: no repository is allowed\") from None", "        return owner, name")], "no allow list, no repository"),
    (H, [("    return (2 <= len(parts) <= 9 and parts[0] == \"agent\"", "    return True or (2 <= len(parts) <= 9 and parts[0] == \"agent\"")], "only agent/** branches"),
    (H, [("    if not path.startswith(SPACE) or", "    if False or")], "files from the space only"),
    (H, [("flags = os.O_RDONLY | os.O_NOFOLLOW |", "flags = os.O_RDONLY |")], "no link followed"),
    (H, [("    if path.startswith(\"/tmp/\"):\n        path = \"/private\" + path", "    if False:\n        pass")], "the space written /tmp/..."),
    (H, [("        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:", "        if not stat.S_ISREG(st.st_mode):")], "the token is the owner's alone"),
    (H, [("    if not TOKEN.fullmatch(token):", "    if not token:")], "the token is one token line"),
    (H, [("        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)\n    except OSError as e:\n        raise Failed(f\"no token", "        fd = os.open(path, os.O_RDONLY)\n    except OSError as e:\n        raise Failed(f\"no token")], "the token is no link"),
    (H, [("    if count == 0:\n        return", "    if True:\n        return")], "the commits are scanned"),
    (H, [(" -m {base}..{tip}", " {base}..{tip}")], "merges are scanned"),
    (H, [("    argv = [\"gitleaks\", \"git\", \"--no-banner\", \"--redact\", \"--ignore-gitleaks-allow\", ", "    argv = [\"gitleaks\", \"git\", \"--no-banner\", \"--redact\", ")], "an allow comment does not count"),
    (H, [("    if not said or int(said.group(1)) != count:", "    if False:")], "gitleaks read the commits pushed"),
    (H, [("    p = run(argv, env(work), \"gitleaks\", ok=(0, 1))\n    if p.returncode == 1:\n        raise Refused(f\"gitleaks found a secret in the commits", "    p = run(argv, env(work), \"gitleaks\", ok=(0, 1, 2))\n    if p.returncode == 1:\n        raise Refused(f\"gitleaks found a secret in the commits")], "a failing gitleaks stops"),
    (H, [("f\"{tip}:refs/heads/{branch}\")", "f\"+{tip}:refs/heads/{branch}\")")], "never a forced push"),
    (H, [("    if not data.startswith(b\"# v2 git bundle\\n\"):", "    if False:")], "a v2 bundle only"),
    (H, [("    if len(refs) != 1 or", "    if False or")], "one ref in the bundle"),
    (H, [("    if set(keys) - CLEAN_KEYS or", "    if False or")], "the clean copy's config"),
    (H, [("or os.path.exists(os.path.join(cache, \"objects\", \"info\", \"alternates\")):", ":")], "the clean copy's alternates"),
    (H, [("        if runs:\n", "        if False:\n")], "what runs on GitHub is refused"),
    (H, [("        scan_text(work, f\"{branch}\\n{meta}\",", "        (lambda *a: None)(work, f\"{branch}\\n{meta}\",")], "the commits' messages, names and authors are scanned"),
    (H, [("    scratch = f\"refs/agent-pr/{os.path.basename(work)}/{branch}\"", "    scratch = f\"refs/agent-pr/{branch}\""),
         ("f\"{tip}:refs/heads/{branch}\")", "f\"{scratch}:refs/heads/{branch}\")")], "a race pushes only what it scanned"),
    (H, [("    scan_text(work, f\"{branch}\\n{title}\\n{body}\", \"the title or the body\")", "    pass")], "the title and body are scanned"),
    (H, [("    if not title or len(title) > 256 or re.search(r\"[\\x00-\\x1f\\x7f]\", title):", "    if False:")], "the title is one line"),
    (H, [("    if not branch_ok(branch):\n        raise Refused(f\"a pull request", "    if False:\n        raise Refused(f\"a pull request")], "a pull request from agent/** only"),
    (H, [("GH_CONFIG_DIR=os.path.join(work, \"gh\"), ", "")], "gh's config folder is fresh"),
    (H, [("f\"--body-file={body_file}\"]", "f\"--body-file={pr_arg}\"]")], "gh reads the helper's copy"),
    (H, [("    argv = [\"git\", \"-c\", \"core.hooksPath=/dev/null\", ", "    argv = [\"git\", ")], "no hooks"),
    (H, [("\"GIT_CONFIG_NOSYSTEM\": \"1\",\n            \"GIT_CONFIG_GLOBAL\": os.devnull, ", "")], "no system or global git config"),
    (H, [("[ \"$l\" = host=github.com ] && ok=1", "ok=1")], "the token for github.com alone"),
    (H, [("echo \"password=$AGENT_TOKEN\"", "echo \"password=x\"")], "the token through the environment (a control)"),
    (G, [("if tool in READERS and", "if False and")], "the guard: no reader names the state folder"),
    (G, [("        if not CALL.fullmatch(command):", "        if False:")], "the guard: one form of call"),
    (G, [("    if \".local/bin/agent-pr\" in command or helper in command:", "    if helper in command:")], "the guard: the helper under any spelling"),
    (G, [("(?:[A-Za-z0-9_][A-Za-z0-9._-]*/)*[A-Za-z0-9_][A-Za-z0-9._-]*\"", "\\S+\"")], "the guard: plain file paths"),
]
survived = []
# python3 -I mutants.py [<words of a label>...]: those mutants alone.
MUTANTS = [m for m in MUTANTS if all(w in m[2] for w in sys.argv[1:])]
for name, pairs, label in MUTANTS:
    with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as d:
        for f in (H, G, "test.sh"):
            shutil.copy(here / f, pathlib.Path(d) / f)
        target = pathlib.Path(d) / name
        text = target.read_text()
        missing = [a for a, _ in pairs if text.count(a) != 1]
        if missing:
            print(f"MISSING: {label}: {missing[0][:70]!r}")
            survived.append(label)
            continue
        for a, b in pairs:
            text = text.replace(a, b)
        target.write_text(text)
        (pathlib.Path(d) / H).chmod(0o755)
        p = subprocess.run(["sh", str(pathlib.Path(d) / "test.sh")], capture_output=True, text=True)
    first = next((l for l in p.stderr.splitlines() if l.startswith("FAIL")), "")
    print(("killed   " if p.returncode else "SURVIVED ") + label + ("   " + first[:100] if p.returncode else ""))
    if not p.returncode:
        survived.append(label)
print(f"{len(MUTANTS)} mutants, {len(survived)} survived: {survived}")
sys.exit(1 if survived else 0)
