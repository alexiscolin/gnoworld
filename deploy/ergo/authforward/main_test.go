package main

import (
	"bufio"
	"bytes"
	"net"
	"strings"
	"testing"
	"time"
)

// A server that answers the line it reads with reply, or with nothing when reply is "", and how to reach it.
// TCP stands for the stack's Unix socket, which the test's sandbox refuses.
func listen(t *testing.T, reply string) (func() (net.Conn, error), chan string) {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })
	got := make(chan string, 1)
	go func() {
		conn, err := l.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		line, _ := bufio.NewReader(conn).ReadString('\n')
		got <- line
		if reply != "" {
			_, _ = conn.Write([]byte(reply))
		}
	}()
	address := l.Addr().String()
	return func() (net.Conn, error) { return net.DialTimeout("tcp", address, time.Second) }, got
}

func TestForwardsOneLineAndItsAnswer(t *testing.T) {
	dial, got := listen(t, "{\"success\":true,\"accountName\":\"g1a\"}\n")
	// Ergo writes its line and keeps the input open: what follows the newline is never read.
	in := strings.NewReader("{\"accountName\":\"g1a\",\"passphrase\":\"t\"}\nnot read")
	var out bytes.Buffer
	if err := forward(in, &out, dial, time.Second); err != nil {
		t.Fatal(err)
	}
	if line := <-got; line != "{\"accountName\":\"g1a\",\"passphrase\":\"t\"}\n" {
		t.Fatalf("the server read %q", line)
	}
	if out.String() != "{\"success\":true,\"accountName\":\"g1a\"}\n" {
		t.Fatalf("Ergo read %q", out.String())
	}
}

func TestFailsWithNoServerNoLineOrNoAnswer(t *testing.T) {
	var out bytes.Buffer
	none := func() (net.Conn, error) { return net.DialTimeout("tcp", "127.0.0.1:1", time.Second) }
	if err := forward(strings.NewReader("x\n"), &out, none, time.Second); err == nil {
		t.Fatal("no server, and no error")
	}
	dial, _ := listen(t, "")
	if err := forward(strings.NewReader("no newline"), &out, dial, time.Second); err == nil {
		t.Fatal("no line, and no error")
	}
	silent, _ := listen(t, "")
	start := time.Now()
	if err := forward(strings.NewReader("x\n"), &out, silent, 200*time.Millisecond); err == nil {
		t.Fatal("no answer, and no error")
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("a silent server held the script past its deadline")
	}
	if out.Len() != 0 {
		t.Fatalf("Ergo read %q from a failure", out.String())
	}
}

func TestReadsNoLinePastItsLimit(t *testing.T) {
	dial, _ := listen(t, "ok\n")
	long := strings.Repeat("a", lineMax) + "\n"
	var out bytes.Buffer
	if err := forward(strings.NewReader(long), &out, dial, time.Second); err == nil {
		t.Fatal("a line past the limit was forwarded")
	}
}

func TestForwardsALineAtItsLimit(t *testing.T) {
	dial, got := listen(t, "ok\n")
	full := strings.Repeat("a", lineMax-1) + "\n"
	var out bytes.Buffer
	if err := forward(strings.NewReader(full), &out, dial, time.Second); err != nil {
		t.Fatal(err)
	}
	if line := <-got; line != full || out.String() != "ok\n" {
		t.Fatalf("the server read %d bytes, Ergo %q", len(line), out.String())
	}
}

func TestHandsOnNoAnswerPastItsLimit(t *testing.T) {
	dial, _ := listen(t, strings.Repeat("a", lineMax)+"\n")
	var out bytes.Buffer
	if err := forward(strings.NewReader("x\n"), &out, dial, time.Second); err == nil {
		t.Fatal("an answer past the limit was handed on")
	}
	if out.Len() != 0 {
		t.Fatalf("Ergo read %d bytes", out.Len())
	}
}

func TestProbesAListener(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := l.Addr().String()
	if probe(address) != 0 {
		t.Fatal("a listener was not found")
	}
	_ = l.Close()
	if probe(address) != 1 {
		t.Fatal("a closed port was found")
	}
}
