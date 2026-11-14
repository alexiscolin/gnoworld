"""check_nginx.py: nginx accepts the image's config, and the built pages are served with their own policy (harness-c; the merge check).

5f's two high findings passed the gate and the review's first read, and only Alexis's Mac saw them: F2459 (a second map_hash_max_size,
nginx refused to start) and F2460 (a slashed address got the bare policy). Docker is refused in the sandbox, so this runs a pinned nginx
(1.30.6, the image's) from the tools' cache, with the checksum of the binary checked:

1. `nginx -t` on deploy/web/nginx.conf as the image has it, with the build's table (app/build/csp.conf) where the image copies it, and
   the paths of the image's filesystem pointed at this tree's and a temporary folder (its logs too: a real nginx -t cannot open /dev/stderr
   under the sandbox). Nginx's own words are shown when it refuses. A warning fails.
2. The same config served on a free port, with what a plain request cannot give left out (the PROXY protocol, the password, the upstream
   hosts of Docker's network): every page of app/build/client/_headers and every .html file, at each address form (slashed, bare,
   index.html), answers 200 with the policy of its own rule in _headers, not the bare one.

What it cannot do fails, never skips: no binary, a checksum that is not the pin's, no build. NGINX_SHA256 and NGINX_START_TIMEOUT are
the tests' switches, which check.sh drops; GitHub's build job sets NGINX_SHA256 to the binary it built from the checked tarball,
and GNOWORLD_BUILD to the folder it built the app in (app/build by default; check.sh drops it too). Usage: check_nginx.py, from the repository root; GNOWORLD_TOOLS is the tools' cache
(~/.cache/gnoworld-tools by default); the pin is scripts/nginx.sha256 (docs/DEVELOPMENT.md, "The pinned nginx")."""
import hashlib
import http.client
import os
import pathlib
import re
import signal
import socket
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__

VERSION = "1.30.6"
PIN = pathlib.Path(__file__).resolve().with_name("nginx.sha256")
START_TIMEOUT = 20.0  # s, for nginx to answer on its port


def fail(*lines):
    sys.exit("check_nginx.py: " + "\n  ".join(str(line) for line in lines))


def pinned():
    """The digest the binary must have: the test switch when set and not empty, else the pin committed beside this script."""
    given = os.environ.get("NGINX_SHA256")
    if given:
        return given
    word = PIN.read_text().split()[0] if PIN.is_file() and PIN.read_text().split() else ""
    if not re.fullmatch(r"[0-9a-f]{64}", word):
        fail(f"no checksum is pinned for nginx {VERSION}: {PIN} holds '{word}', not a SHA-256 in hex.",
             "Build the binary and record its checksum there (docs/DEVELOPMENT.md, \"The pinned nginx\"); a binary nobody pinned is not run.")
    return word


def binary(tools):
    """The pinned nginx and its mime.types, checksum checked."""
    folder = tools / f"nginx-{VERSION}"
    exe, mime = folder / "nginx", folder / "conf" / "mime.types"
    if not exe.is_file() or not os.access(exe, os.X_OK) or not mime.is_file():
        fail(f"no nginx {VERSION} at {exe} (and {mime}): build it as docs/DEVELOPMENT.md says (\"The pinned nginx\"); a merge check does not skip nginx")
    actual = hashlib.sha256(exe.read_bytes()).hexdigest()
    want = pinned()
    if actual != want:
        fail(f"the checksum of {exe} is {actual}, not the pinned {want}: this is not the nginx {VERSION} that was pinned, and it is not run")
    return exe, mime


def free_ports(n):
    held = [socket.socket() for _ in range(n)]
    try:
        for s in held:
            s.bind(("127.0.0.1", 0))
        return [s.getsockname()[1] for s in held]
    finally:
        for s in held:
            s.close()


def staged(conf, where, mime, table, root, ports):
    """The image's config with its filesystem and its network put where a plain run can use them. A line of the image's config this
    cannot find is a failure: the image changed, and this must follow it."""
    def once(pattern, new, text):
        text, n = re.subn(pattern, lambda _: new, text, flags=re.M)
        if n == 0:
            fail(f"deploy/web/nginx.conf has no line /{pattern}/: the image changed, and this check must follow it")
        return text

    conf = once(r"^\s*include\s+/etc/nginx/mime\.types;", f"include {mime};", conf)
    conf = once(r"^\s*include\s+/etc/nginx/csp\.conf;", f"include {table};", conf)
    conf = once(r"^\s*root\s+/usr/share/nginx/html;", f"root {root};", conf)
    conf = once(r"^\s*listen\s+8080\s+proxy_protocol;", f"listen 127.0.0.1:{ports[0]};", conf)
    conf = once(r"^\s*listen\s+127\.0\.0\.1:8081;", f"listen 127.0.0.1:{ports[1]};", conf)
    conf = re.sub(r"^\s*auth_basic(_user_file)?\s+[^;]*;\n", "", conf, flags=re.M)  # a plain request has no password
    conf = re.sub(r"^(\s*pid\s+)\S+;", lambda m: f"{m.group(1)}{where}/nginx.pid;", conf, flags=re.M)
    conf = re.sub(r"^(\s*(?:error|access)_log\s+)/dev/std\w+", lambda m: f"{m.group(1)}{where}/nginx.log", conf, flags=re.M)  # the sandbox refuses /dev/stderr
    conf = re.sub(r"(\s)/tmp/(\w+_temp)\b", lambda m: f"{m.group(1)}{where}/{m.group(2)}", conf)
    # nginx resolves a literal upstream host as it loads: Docker's names (ergo, server) are no host here.
    return re.sub(r"(proxy_pass\s+https?://)[A-Za-z][\w.-]*(:\d+;)", r"\g<1>127.0.0.1\2", conf)


def rules(headers):
    """_headers as a host reads it: each path, and the Content-Security-Policy its rule sets (the last one)."""
    out, path = {}, None
    for line in headers.splitlines():
        if line.strip() and not line[0].isspace():
            path = line.strip()
            out.setdefault(path, None)
        elif path and line.strip().startswith("Content-Security-Policy:"):
            out[path] = line.strip().split(":", 1)[1].strip()
    return out


def addresses(client, by_path):
    """[(address, expected policy, why)]: every html file at each form nginx answers it at, and every other path _headers names."""
    asked = {}
    catch_all = by_path.get("/*")
    for page in sorted(client.rglob("*.html")):
        rel = page.relative_to(client).as_posix()
        if rel == "index.html":
            canonical, forms = "/", ["/", "/index.html"]
        elif rel.endswith("/index.html"):
            canonical = "/" + rel[: -len("/index.html")]
            forms = [canonical + "/", canonical, "/" + rel]
        else:
            canonical, forms = "/" + rel, ["/" + rel]
        want = by_path.get(canonical) or by_path.get(canonical + "/")
        if not want:
            fail(f"app/build/client/_headers has no Content-Security-Policy rule for the page {rel} ({canonical})" + (", only the catch-all /*" if catch_all else ""))
        for form in forms:
            asked[form] = (want, f"the page {rel}")
    for path, want in by_path.items():
        if path != "/*" and "*" not in path and want and path not in asked:
            asked[path] = (want, "a path _headers names")
    return [(path, *asked[path]) for path in sorted(asked)]


def serve(exe, conf, where, port):
    """Starts nginx in the foreground, in a group of its own; returns it once it answers, or fails saying it did not start."""
    timeout = float(os.environ.get("NGINX_START_TIMEOUT") or START_TIMEOUT)
    out = open(os.path.join(where, "serve.out"), "w")
    proc = subprocess.Popen([str(exe), "-c", conf, "-p", where + "/", "-e", os.path.join(where, "error.log"), "-g", "daemon off;"],
                            stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    began = time.monotonic()
    try:
        while True:
            if proc.poll() is not None:
                out.flush()
                fail(f"nginx did not start serving: it exited with {proc.returncode}", open(os.path.join(where, "serve.out")).read()[-1500:])
            try:
                socket.create_connection(("127.0.0.1", port), timeout=1).close()
                return proc
            except OSError:
                pass
            if time.monotonic() - began > timeout:
                fail(f"nginx did not start serving: nothing answered on port {port} within {timeout:g} s")
            time.sleep(0.1)
    except BaseException:
        stop(proc)
        raise


def stop(proc):
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            pass
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()


def ask(port, path):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request("GET", path)
        response = conn.getresponse()
        response.read()
        return response.status, response.msg.get_all("Content-Security-Policy") or []
    finally:
        conn.close()


def main():
    tools = pathlib.Path(os.environ.get("GNOWORLD_TOOLS") or os.path.join(os.path.expanduser("~"), ".cache", "gnoworld-tools"))
    exe, mime = binary(tools)
    build = pathlib.Path(os.environ.get("GNOWORLD_BUILD") or "app/build")  # GitHub's build job builds into a folder of its own
    client, table, headers = build / "client", build / "csp.conf", build / "client" / "_headers"
    for needed in (table, headers, pathlib.Path("deploy/web/nginx.conf")):
        if not needed.is_file():
            fail(f"{needed} is missing: the merge check builds the app first (app/react-router.config.ts writes csp.conf and _headers)")
    bare = re.search(r'default\s+"([^"]*)"', table.read_text())
    bare = bare.group(1) if bare else None
    by_path = rules(headers.read_text())
    # A visitor's first load asks for every file of the build twice (deploy/test.sh does), so each zone's burst must hold twice its files or a
    # first visit gets a 429 (F3385: 44 of 220 requests at a burst of 160): the hashed files under the files' zone, the rest under the visitors'.
    hashed = ("assets", "textures", "world-pictures")
    found = [p.relative_to(client).parts[0] for p in client.rglob("*") if p.is_file()]
    conf = pathlib.Path("deploy/web/nginx.conf").read_text()
    for zone, files in (("files", sum(1 for top in found if top in hashed)), ("visitors", sum(1 for top in found if top not in hashed))):
        bursts = [int(n) for n in re.findall(rf"zone={zone}\s+burst=(\d+)", conf)]
        if not bursts or min(bursts) < 2 * files:
            fail(f"the {zone}' burst in deploy/web/nginx.conf is {min(bursts) if bursts else 'missing'}, under twice the build's {files} files of that zone ({2 * files}): a first visit would get a 429 (F3385)")

    with tempfile.TemporaryDirectory(prefix="check-nginx.") as where:
        where = os.path.realpath(where)
        ports = free_ports(2)
        conf = os.path.join(where, "nginx.conf")
        pathlib.Path(conf).write_text(staged(pathlib.Path("deploy/web/nginx.conf").read_text(), where, mime.resolve(), table.resolve(), client.resolve(), ports))
        test = subprocess.run([str(exe), "-t", "-c", conf, "-p", where + "/", "-e", os.path.join(where, "error.log")], capture_output=True, text=True, timeout=60)
        said = (test.stdout + test.stderr).strip()
        if test.returncode != 0:
            fail("nginx -t refused deploy/web/nginx.conf with the build's table:", said)
        warnings = [line for line in said.splitlines() if "[warn]" in line]
        if warnings:
            fail("nginx -t warned (a warning fails the merge check):", *warnings)
        print(f"check_nginx.py: nginx {VERSION} -t accepts deploy/web/nginx.conf with the build's table")

        proc = serve(exe, conf, where, ports[0])
        problems = []
        try:
            for path, want, why in addresses(client, by_path):
                status, got = ask(ports[0], path)
                if status != 200:
                    problems.append(f"GET {path}: answered {status}, not 200 ({why}: _headers names it, the build does not serve it)")
                elif len(got) != 1:
                    problems.append(f"GET {path}: answered {len(got)} Content-Security-Policy headers, not one")
                elif got[0] == want:
                    print(f"ok    GET {path} -> 200, the policy of {why}")
                elif got[0] == bare:
                    problems.append(f"GET {path}: answered the bare policy (the table's default), not the policy of {why}")
                else:
                    problems.append(f"GET {path}: answered another page's policy, not the policy of {why}")
        finally:
            stop(proc)
        if problems:
            fail("a served page did not answer with its own policy:", *problems)
    print("check_nginx.py: every page answers with its own policy at each address form")


main()
