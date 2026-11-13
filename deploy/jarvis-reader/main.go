// jarvis's reader (10u-g2, D13987): gnomcp in a container of its own. gnomcp speaks over stdio and ignores HTTPS_PROXY,
// so this does two things with the standard library alone:
//   - the bridge: one TCP port, and for each connection one gnomcp whose stdio is that connection, with an environment of
//     its own making (a home in memory and nothing else: no inherited secret), ended with the connection; gnomcp's audit
//     is filtered to tool, result and duration before it reaches the log;
//   - the relay: every chain host gnomcp reads is named, in /etc/hosts, to one loopback address (127.0.0.2); the relay
//     listens there on 443, reads the TLS ClientHello's server name (never the rest), refuses a name not on READER_HOSTS,
//     and opens a CONNECT tunnel to that name through the way out, the ClientHello replayed first. The TLS stays between
//     gnomcp and the host; the way out's list is what lets a host out.
//
// Settings (compose.yaml): READER_LISTEN host:port, READER_GNOMCP and READER_CONFIG paths, READER_PROXY host:port,
// READER_HOSTS comma-separated, READER_MAX connections at once.
package main

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"
)

type config struct {
	gnomcp   string
	profiles string
	max      int
}

func main() {
	listen, proxy := os.Getenv("READER_LISTEN"), os.Getenv("READER_PROXY")
	hosts := strings.Split(os.Getenv("READER_HOSTS"), ",")
	max, err := strconv.Atoi(os.Getenv("READER_MAX"))
	cfg := config{gnomcp: os.Getenv("READER_GNOMCP"), profiles: os.Getenv("READER_CONFIG"), max: max}
	if listen == "" || proxy == "" || os.Getenv("READER_HOSTS") == "" || cfg.gnomcp == "" || cfg.profiles == "" || err != nil || max < 1 {
		fmt.Fprintln(os.Stderr, "reader: READER_LISTEN, READER_PROXY, READER_HOSTS, READER_GNOMCP, READER_CONFIG and READER_MAX are required")
		os.Exit(2)
	}
	names := map[string]bool{}
	for _, host := range hosts {
		names[host] = true
	}
	relayLn, err := net.Listen("tcp", relayAddress)
	if err != nil {
		fmt.Fprintln(os.Stderr, "reader:", err)
		os.Exit(1)
	}
	go relay(relayLn, proxy, names)
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		fmt.Fprintln(os.Stderr, "reader:", err)
		os.Exit(1)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
	go func() { <-stop; os.Exit(0) }()
	serve(ln, cfg)
}

// relayAddress is the one loopback address /etc/hosts gives every relayed host.
const relayAddress = "127.0.0.2:443"

// serve gives each connection its own gnomcp, at most cfg.max at once; one past it is closed at once.
func serve(ln net.Listener, cfg config) {
	slots := make(chan struct{}, cfg.max)
	for {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		select {
		case slots <- struct{}{}:
			go func() {
				defer func() { <-slots }()
				bridge(conn, cfg)
			}()
		default:
			_ = conn.Close()
		}
	}
}

// bridge runs one gnomcp for one connection, as jarvis's own spawn did (jarvis/src/gnomcp.ts): the same flags, a home of
// its own, its audit on stderr. Its environment is these two names alone.
func bridge(conn net.Conn, cfg config) {
	defer conn.Close()
	home, err := os.MkdirTemp("", "reader-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "reader: no home:", err)
		return
	}
	defer os.RemoveAll(home)
	cmd := exec.Command(cfg.gnomcp, "-config", cfg.profiles, "-audit-path", "/dev/stderr", "-audit-reads",
		"-sessions-path", filepath.Join(home, "sessions"))
	cmd.Dir = home
	cmd.Env = []string{"HOME=" + home, "GNOMCP_AGENT_KEYS_PATH=" + filepath.Join(home, "agent-keys")}
	// The stderr pipe is made last, so no early return leaves its two ends open.
	in, err := cmd.StdinPipe()
	if err != nil {
		return
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return
	}
	audit, err := cmd.StderrPipe()
	if err != nil || cmd.Start() != nil {
		return
	}
	audited := make(chan struct{})
	go func() {
		filterAudit(audit, os.Stderr)
		close(audited)
	}()
	go func() {
		_, _ = io.Copy(in, conn)
		_ = in.Close()
		// gnomcp ends on its stdin's end; one that does not is killed.
		time.AfterFunc(2*time.Second, func() { _ = cmd.Process.Kill() })
	}()
	_, _ = io.Copy(conn, out)
	// Wait closes the pipes: the audit is read to its end first, so gnomcp's last lines are kept.
	<-audited
	_ = cmd.Wait()
}

// filterAudit copies gnomcp's audit to w as jarvis's own does (jarvis/src/gnomcpLog.ts, logLine): a line that opens
// with { or [ logs its tool, its result and its duration alone when it is an audit row, else a fixed marker; any other
// line is cut at its first {, then to 512 bytes, its hidden characters shown as [U+XXXX]. A line past 64 KiB is never
// parsed: a fixed marker if it opens like a row, else its head cut the same way; the rest of it is read and dropped.
func filterAudit(r io.Reader, w io.Writer) {
	reader := bufio.NewReaderSize(r, 64*1024)
	for {
		line, err := reader.ReadSlice('\n')
		if errors.Is(err, bufio.ErrBufferFull) {
			// ReadSlice's slice is bufio's own buffer, which the next read refills: the head is copied before the drain.
			head := string(line[:min(len(line), 512)])
			for errors.Is(err, bufio.ErrBufferFull) {
				_, err = reader.ReadSlice('\n')
			}
			if opensRow(head) {
				fmt.Fprintln(w, `{"audit":"over-long line dropped"}`)
			} else {
				fmt.Fprintln(w, otherLine(head))
			}
		} else if text := strings.TrimRight(string(line), "\r\n"); strings.TrimFunc(text, jsSpace) != "" {
			fmt.Fprintln(w, auditLine(text))
		}
		if err != nil {
			return
		}
	}
}

// jsSpace is JavaScript's \s, which jarvis's filter reads a line's opening and a blank line by.
func jsSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func opensRow(text string) bool {
	opened := strings.TrimLeftFunc(text, jsSpace)
	return strings.HasPrefix(opened, "{") || strings.HasPrefix(opened, "[")
}

// otherLine is a line of gnomcp's own words up to its first {: an audit row written into an unended line is no word of gnomcp's.
func otherLine(text string) string {
	if end := strings.IndexByte(text, '{'); end >= 0 {
		text = text[:end]
	}
	return shown(text, 512)
}

func auditLine(text string) string {
	if !opensRow(text) {
		return otherLine(text)
	}
	var tool, result string
	var duration float64
	var raw map[string]json.RawMessage
	if json.Unmarshal([]byte(text), &raw) != nil || raw == nil ||
		!field(raw, "tool", &tool) || !field(raw, "result", &result) || !field(raw, "duration_ms", &duration) {
		return `{"audit":"malformed"}`
	}
	out, _ := json.Marshal(map[string]any{"tool": name(tool), "result": name(result), "duration_ms": duration})
	return string(out)
}

// field reads a row's key, written exactly so, present, not null and of its type, as jarvis's schema does.
func field(raw map[string]json.RawMessage, key string, to any) bool {
	value, found := raw[key]
	return found && string(value) != "null" && json.Unmarshal(value, to) == nil
}

// name is a tool's or a result's word as jarvis shows it (tracing.ts, shown): itself when it is a name, else a fixed word.
func name(text string) string {
	if namePattern.MatchString(text) {
		return text
	}
	return "<malformed>"
}

var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// shown cuts text to max bytes and writes each hidden or non-printing character as [U+XXXX].
func shown(text string, max int) string {
	var b strings.Builder
	for _, r := range text {
		if b.Len() >= max {
			break
		}
		if unicode.IsPrint(r) && !unicode.Is(unicode.Cf, r) {
			b.WriteRune(r)
		} else {
			fmt.Fprintf(&b, "[U+%04X]", r)
		}
	}
	return b.String()
}

// recorded keeps every byte read from the connection, so a hello read to learn its name can be replayed.
type recorded struct {
	net.Conn
	read bytes.Buffer
}

func (c *recorded) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	c.read.Write(p[:n])
	return n, err
}

// Write drops what crypto/tls would answer a hello with (an alert): nothing is said to the client before the tunnel is.
func (c *recorded) Write(p []byte) (int, error) { return len(p), nil }

var errNamed = errors.New("named")

// serverName reads a TLS ClientHello from conn, by crypto/tls itself stopped at the hello, and answers its server name
// and the bytes read; "" when there is none or it is no hello.
func serverName(conn net.Conn) (string, []byte) {
	rec := &recorded{Conn: conn}
	name := ""
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_ = tls.Server(rec, &tls.Config{GetConfigForClient: func(h *tls.ClientHelloInfo) (*tls.Config, error) {
		name = h.ServerName
		return nil, errNamed
	}}).Handshake()
	_ = conn.SetReadDeadline(time.Time{})
	return name, rec.read.Bytes()
}

// relay tunnels each connection to the host its ClientHello names, if that name is in hosts, through the proxy, the hello
// replayed and the bytes then copied both ways; any other name, or a tunnel the proxy refuses, closes the connection.
func relay(ln net.Listener, proxy string, hosts map[string]bool) {
	slots := make(chan struct{}, maxTunnels)
	for {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		select {
		case slots <- struct{}{}:
			go func() {
				defer func() { <-slots }()
				tunnel(conn, proxy, hosts)
			}()
		default:
			_ = conn.Close()
		}
	}
}

// maxTunnels is the tunnels open at once: gnomcp, at most 2, opens a few for its reads.
const maxTunnels = 16

func tunnel(conn net.Conn, proxy string, hosts map[string]bool) {
	defer conn.Close()
	host, first := serverName(conn)
	if !hosts[host] {
		return
	}
	up, err := net.DialTimeout("tcp", proxy, 10*time.Second)
	if err != nil {
		return
	}
	defer up.Close()
	_ = up.SetDeadline(time.Now().Add(15 * time.Second))
	request := fmt.Sprintf("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\n\r\n", host, host)
	if _, err := io.WriteString(up, request); err != nil {
		return
	}
	reader := bufio.NewReader(up)
	// smokescreen's goproxy answers HTTP/1.0 200; ReadResponse takes either version.
	response, err := http.ReadResponse(reader, &http.Request{Method: http.MethodConnect})
	if err != nil || response.StatusCode != http.StatusOK {
		return
	}
	if _, err := up.Write(first); err != nil {
		return
	}
	_ = up.SetDeadline(time.Time{})
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(up, conn); done <- struct{}{} }()
	go func() { _, _ = io.Copy(conn, reader); done <- struct{}{} }()
	<-done
}
