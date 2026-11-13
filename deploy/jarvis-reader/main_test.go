package main

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// A stand-in for gnomcp: a script that runs the command its first line names after the flags gnomcp is given.
func fakeGnomcp(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "gnomcp")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func listen(t *testing.T) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	return ln
}

func dial(t *testing.T, ln net.Listener) net.Conn {
	t.Helper()
	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	return conn
}

func TestBridgeCarriesLinesBothWays(t *testing.T) {
	ln := listen(t)
	go serve(ln, config{gnomcp: fakeGnomcp(t, "exec cat"), profiles: "/x", max: 2})
	conn := dial(t, ln)
	if _, err := conn.Write([]byte("{\"a\":1}\n")); err != nil {
		t.Fatal(err)
	}
	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil || line != "{\"a\":1}\n" {
		t.Fatalf("got %q, %v", line, err)
	}
}

func TestBridgeGivesGnomcpItsFlagsAndNoSecret(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-must-not-pass")
	t.Setenv("HTTPS_PROXY", "http://guard:1")
	ln := listen(t)
	go serve(ln, config{gnomcp: fakeGnomcp(t, "echo \"$@\"; env | sort; exit 0"), profiles: "/etc/p.toml", max: 2})
	conn := dial(t, ln)
	var all strings.Builder
	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadString('\n')
		all.WriteString(line)
		if err != nil {
			break
		}
	}
	out := all.String()
	if !strings.HasPrefix(out, "-config /etc/p.toml -audit-path /dev/stderr -audit-reads -sessions-path ") {
		t.Fatalf("flags: %q", out)
	}
	if strings.Contains(out, "sk-must-not-pass") || strings.Contains(out, "ANTHROPIC") || strings.Contains(out, "HTTPS_PROXY") {
		t.Fatalf("the child inherited the bridge's environment: %q", out)
	}
	for _, want := range []string{"HOME=", "GNOMCP_AGENT_KEYS_PATH="} {
		if !strings.Contains(out, want) {
			t.Fatalf("no %s in %q", want, out)
		}
	}
}

func TestBridgeEndsTheChildWhenTheConnectionEndsAndRemovesItsHome(t *testing.T) {
	ln := listen(t)
	marker := filepath.Join(t.TempDir(), "home")
	go serve(ln, config{gnomcp: fakeGnomcp(t, "echo \"$HOME\" >"+marker+"; exec cat"), profiles: "/x", max: 2})
	conn := dial(t, ln)
	_, _ = conn.Write([]byte("go\n"))
	_, _ = bufio.NewReader(conn).ReadString('\n')
	home := ""
	for i := 0; i < 50 && home == ""; i++ {
		b, _ := os.ReadFile(marker)
		home = strings.TrimSpace(string(b))
		time.Sleep(20 * time.Millisecond)
	}
	if home == "" {
		t.Fatal("the child wrote no home")
	}
	_ = conn.Close()
	for i := 0; i < 100; i++ {
		if _, err := os.Stat(home); os.IsNotExist(err) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("the home %s is still there", home)
}

func TestBridgeRefusesPastItsCap(t *testing.T) {
	ln := listen(t)
	go serve(ln, config{gnomcp: fakeGnomcp(t, "exec cat"), profiles: "/x", max: 1})
	first := dial(t, ln)
	_, _ = first.Write([]byte("x\n"))
	_, _ = bufio.NewReader(first).ReadString('\n')
	second := dial(t, ln)
	// Served, it would echo this line; refused, it is closed at once: EOF well before the deadline, never an echo or a timeout.
	_, _ = second.Write([]byte("y\n"))
	start := time.Now()
	line, err := bufio.NewReader(second).ReadString('\n')
	var timeout net.Error
	if line != "" || err == nil || (errors.As(err, &timeout) && timeout.Timeout()) || time.Since(start) > 2*time.Second {
		t.Fatalf("a second connection past the cap: %q, %v after %v", line, err, time.Since(start))
	}
}

// A proxy that answers CONNECT with the status line it is given, then echoes what comes first.
func fakeProxy(t *testing.T, status string, asked chan<- string) net.Listener {
	ln := listen(t)
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				reader := bufio.NewReader(conn)
				line, _ := reader.ReadString('\n')
				asked <- strings.TrimSpace(line)
				for {
					header, err := reader.ReadString('\n')
					if err != nil || header == "\r\n" {
						break
					}
				}
				_, _ = conn.Write([]byte(status + "\r\n\r\n"))
				if strings.Contains(status, " 200") {
					buffer := make([]byte, 4096)
					n, _ := reader.Read(buffer)
					_, _ = conn.Write(buffer[:n])
				}
			}()
		}
	}()
	return ln
}

// A real ClientHello for name, as crypto/tls writes it.
func hello(t *testing.T, name string) []byte {
	t.Helper()
	a, b := net.Pipe()
	go func() { _ = tls.Client(a, &tls.Config{ServerName: name, InsecureSkipVerify: true}).Handshake() }()
	buffer := make([]byte, 4096)
	n, err := b.Read(buffer)
	if err != nil {
		t.Fatal(err)
	}
	_ = a.Close()
	_ = b.Close()
	return buffer[:n]
}

func allowed(names ...string) map[string]bool {
	out := map[string]bool{}
	for _, name := range names {
		out[name] = true
	}
	return out
}

// smokescreen answers HTTP/1.0 200 (goproxy); HTTP/1.1 200 is as good.
func TestRelayNamesTheSNIHostToTheProxyAndCarriesTheHelloUntouched(t *testing.T) {
	for _, status := range []string{"HTTP/1.0 200 OK", "HTTP/1.1 200 OK"} {
		asked := make(chan string, 1)
		proxy := fakeProxy(t, status, asked)
		ln := listen(t)
		go relay(ln, proxy.Addr().String(), allowed("rpc.gno.land", "indexer.gno.land"))
		conn := dial(t, ln)
		sent := hello(t, "indexer.gno.land")
		_, _ = conn.Write(sent)
		got := make([]byte, len(sent))
		if _, err := io.ReadFull(conn, got); err != nil || string(got) != string(sent) {
			t.Fatalf("%s: the hello changed or never came back: %v", status, err)
		}
		if line := <-asked; line != "CONNECT indexer.gno.land:443 HTTP/1.1" {
			t.Fatalf("%s: asked %q", status, line)
		}
	}
}

func TestRelayRefusesANameNotOnItsListAndNoName(t *testing.T) {
	asked := make(chan string, 2)
	proxy := fakeProxy(t, "HTTP/1.0 200 OK", asked)
	ln := listen(t)
	go relay(ln, proxy.Addr().String(), allowed("rpc.gno.land"))
	for _, sent := range [][]byte{hello(t, "api.anthropic.com"), hello(t, ""), []byte("not a hello at all, long enough to be read")} {
		conn := dial(t, ln)
		_, _ = conn.Write(sent)
		if n, err := conn.Read(make([]byte, 64)); n != 0 || err == nil {
			t.Fatalf("a refused name was served: %d bytes", n)
		}
	}
	select {
	case line := <-asked:
		t.Fatalf("the proxy was asked %q for a refused name", line)
	default:
	}
}

func TestRelayClosesWhenTheProxyRefuses(t *testing.T) {
	asked := make(chan string, 1)
	proxy := fakeProxy(t, "HTTP/1.0 407 Proxy Authentication Required", asked)
	ln := listen(t)
	go relay(ln, proxy.Addr().String(), allowed("rpc.gno.land"))
	conn := dial(t, ln)
	_, _ = conn.Write(hello(t, "rpc.gno.land"))
	if n, err := conn.Read(make([]byte, 64)); err == nil || n != 0 {
		t.Fatalf("a refused tunnel gave %d bytes", n)
	}
}

func TestAuditKeepsToolResultAndDurationAlone(t *testing.T) {
	in := `{"tool":"gno_render","profile":"p","args_summary":"{\"realm\":\"SECRET-QUESTION\"}","result":"ok","duration_ms":12,"error":"SECRET-ERR"}` + "\n"
	var out strings.Builder
	filterAudit(strings.NewReader(in), &out)
	if strings.Contains(out.String(), "SECRET") || !strings.Contains(out.String(), `"tool":"gno_render"`) ||
		!strings.Contains(out.String(), `"result":"ok"`) || !strings.Contains(out.String(), `"duration_ms":12`) {
		t.Fatalf("audit line: %q", out.String())
	}
}

func TestAuditCutsAnyOtherLineAndShowsHiddenCharacters(t *testing.T) {
	in := "panic \x1b[31m\u202e" + strings.Repeat("A", 2000) + "\n"
	var out strings.Builder
	filterAudit(strings.NewReader(in), &out)
	got := strings.TrimSuffix(out.String(), "\n")
	if len(got) > 512 || strings.ContainsAny(got, "\x1b\u202e") || !strings.Contains(got, "[U+001B]") || !strings.Contains(got, "[U+202E]") {
		t.Fatalf("other line: %d bytes %q", len(got), got)
	}
}

func TestAuditKeepsALongLineFromBlockingTheNext(t *testing.T) {
	in := strings.Repeat("x", 200000) + "\n" + `{"tool":"t","result":"ok","duration_ms":1}` + "\n"
	var out strings.Builder
	filterAudit(strings.NewReader(in), &out)
	if !strings.Contains(out.String(), `"tool":"t"`) {
		t.Fatal("the line after a long one was lost")
	}
}

func TestOneNameForEveryHostAndTheAddressTheRelayListensOn(t *testing.T) {
	if relayAddress != "127.0.0.2:443" {
		t.Fatalf("relay address %q: compose's extra_hosts name 127.0.0.2", relayAddress)
	}
}

func TestAuditNeverLogsTheLineAfterAnOverLongOne(t *testing.T) {
	in := strings.Repeat("x", 65536+5) + "\n" + `{"tool":"gno_render","args_summary":"{\"realm\":\"SECRET-QUESTION\"}","result":"ok","duration_ms":3}` + "\n"
	var out strings.Builder
	filterAudit(strings.NewReader(in), &out)
	if strings.Contains(out.String(), "SECRET") {
		t.Fatalf("a planted argument reached the log: %q", out.String())
	}
	if !strings.Contains(out.String(), `"tool":"gno_render"`) {
		t.Fatalf("the audit line after the long one was lost: %q", out.String())
	}
}

func TestAuditNeverParsesTheHeadOfAnOverLongLineAsJSON(t *testing.T) {
	in := `{"tool":"head","args_summary":"SECRET","result":"ok","duration_ms":1}` + strings.Repeat(" ", 70000) + "\n"
	var out strings.Builder
	filterAudit(strings.NewReader(in), &out)
	// Parsed, the row would come back re-made as {"duration_ms":1,"result":"ok","tool":"head"}.
	if strings.Contains(out.String(), `"tool":"head"}`) || strings.Contains(out.String(), `"duration_ms":1,`) {
		t.Fatalf("the head was parsed as an audit row: %q", out.String())
	}
}

func TestFilterAuditEndsBeforeItsCallerMayWait(t *testing.T) {
	var out strings.Builder
	done := make(chan struct{})
	go func() {
		filterAudit(strings.NewReader(`{"tool":"t","result":"ok","duration_ms":1}`+"\n"), &out)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("filterAudit did not return at the end of its input")
	}
}

func TestRelayHoldsAtMost16TunnelsAtOnce(t *testing.T) {
	if maxTunnels != 16 {
		t.Fatalf("maxTunnels is %d", maxTunnels)
	}
	// A proxy that opens every tunnel and holds it.
	proxy := listen(t)
	go func() {
		for {
			conn, err := proxy.Accept()
			if err != nil {
				return
			}
			go func() {
				reader := bufio.NewReader(conn)
				for {
					if line, err := reader.ReadString('\n'); err != nil || line == "\r\n" {
						break
					}
				}
				_, _ = conn.Write([]byte("HTTP/1.0 200 OK\r\n\r\n"))
				_, _ = io.Copy(io.Discard, conn)
			}()
		}
	}()
	ln := listen(t)
	go relay(ln, proxy.Addr().String(), allowed("rpc.gno.land"))
	sent := hello(t, "rpc.gno.land")
	for i := 0; i < maxTunnels; i++ {
		c := dial(t, ln)
		_, _ = c.Write(sent)
	}
	time.Sleep(500 * time.Millisecond)
	over := dial(t, ln)
	_, _ = over.Write(sent)
	start := time.Now()
	n, err := over.Read(make([]byte, len(sent)))
	var timeout net.Error
	if n != 0 || err == nil || (errors.As(err, &timeout) && timeout.Timeout()) || time.Since(start) > 2*time.Second {
		t.Fatalf("a 17th tunnel was served: %d bytes, %v", n, err)
	}
}

func TestAuditLogsAMarkerForAnOverLongRowAndNoPartOfIt(t *testing.T) {
	for _, lead := range []string{"", "   "} {
		in := lead + `{"tool":"gno_render","args_summary":"PLANTED` + strings.Repeat("x", 70000) + "\"}\n"
		var out strings.Builder
		filterAudit(strings.NewReader(in), &out)
		if strings.TrimSpace(out.String()) != `{"audit":"over-long line dropped"}` {
			t.Fatalf("lead %q: logged %.80q", lead, out.String())
		}
	}
	var out strings.Builder
	filterAudit(strings.NewReader("panic: "+strings.Repeat("y", 70000)+"\n"), &out)
	if !strings.HasPrefix(out.String(), "panic: yyy") {
		t.Fatalf("a line that is no row lost its head: %.40q", out.String())
	}
}

func TestAuditNeverLogsAMalformedRow(t *testing.T) {
	rows := []string{
		`{"tool":"gno_render","args":{"path":"my private words"},"result":"ok"`,
		`[{"args":"array words"}]`,
		`{"tool":"t","result":"ok","duration_ms":1} trailing words`,
		`{"tool":"t","result":"ok","args":"missing its time, words"}`,
		`{"tool":null,"result":"ok","duration_ms":1,"args":"null words"}`,
		`{"TOOL":"t","RESULT":"ok","DURATION_MS":1,"args":"case words"}`,
		` ` + " " + `{"tool":"t","result":"ok","duration_ms":"1","args":"typed words"}`,
	}
	for _, row := range rows {
		var out strings.Builder
		filterAudit(strings.NewReader(row+"\n"), &out)
		if got := strings.TrimSuffix(out.String(), "\n"); got != `{"audit":"malformed"}` {
			t.Fatalf("row %q logged %q", row, got)
		}
	}
}

func TestAuditShowsAToolOrResultThatIsNoNameAsMalformed(t *testing.T) {
	var out strings.Builder
	filterAudit(strings.NewReader(`{"tool":"Gno render words","result":"ok","duration_ms":4}`+"\n"), &out)
	var row map[string]any
	if err := json.Unmarshal([]byte(out.String()), &row); err != nil || row["tool"] != "<malformed>" || row["result"] != "ok" ||
		row["duration_ms"] != 4.0 || len(row) != 3 {
		t.Fatalf("logged %q", out.String())
	}
}

func TestAuditCutsWordsAtTheFirstBrace(t *testing.T) {
	var out strings.Builder
	filterAudit(strings.NewReader(`panic: oops {"args":"words after brace"}`+"\n"), &out)
	if got := strings.TrimSuffix(out.String(), "\n"); got != "panic: oops " {
		t.Fatalf("logged %q", got)
	}
	out.Reset()
	filterAudit(strings.NewReader(`panic: `+`{"args":"over-long words"}`+strings.Repeat("y", 70000)+"\n"), &out)
	if got := strings.TrimSuffix(out.String(), "\n"); got != "panic: " {
		t.Fatalf("an over-long line logged %.80q", got)
	}
	out.Reset()
	filterAudit(strings.NewReader("   \t\n"), &out)
	if out.String() != "" {
		t.Fatalf("a blank line logged %q", out.String())
	}
}
