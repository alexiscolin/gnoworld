// Ergo's auth script in the stack (slice 3's plan, 3e): Ergo writes one JSON line and reads one line back
// (irc/authscript.go); this hands the line to the server's socket (server/src/ergo/auth.ts) and the answer
// back, since Ergo's image has no Node. "probe <host:port>" is the container's health check.
package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"os"
	"time"
)

// The server's AUTH_SOCKET in the stack (deploy/compose.yaml), and Ergo's line limit for a script's line.
const (
	socket   = "/run/gnoworld/auth.sock"
	lineMax  = 16 * 1024
	deadline = 5 * time.Second
)

func main() {
	if len(os.Args) == 3 && os.Args[1] == "probe" {
		os.Exit(probe(os.Args[2]))
	}
	dial := func() (net.Conn, error) { return net.DialTimeout("unix", socket, deadline) }
	if err := forward(os.Stdin, os.Stdout, dial, deadline); err != nil {
		fmt.Fprintln(os.Stderr, "authforward:", err)
		os.Exit(2)
	}
}

// probe answers 0 when something listens at address, else 1.
func probe(address string) int {
	conn, err := net.DialTimeout("tcp", address, 2*time.Second)
	if err != nil {
		return 1
	}
	_ = conn.Close()
	return 0
}

// forward hands one line of in to the server dial reaches and the server's one-line answer to out, all
// within limit. Ergo never closes the script's input, so the line ends at its newline.
func forward(in io.Reader, out io.Writer, dial func() (net.Conn, error), limit time.Duration) error {
	line, err := bufio.NewReader(io.LimitReader(in, lineMax)).ReadBytes('\n')
	if err != nil {
		return fmt.Errorf("no line from Ergo: %w", err)
	}
	conn, err := dial()
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()
	if err := conn.SetDeadline(time.Now().Add(limit)); err != nil {
		return err
	}
	if _, err := conn.Write(line); err != nil {
		return err
	}
	answer, err := bufio.NewReader(io.LimitReader(conn, lineMax)).ReadBytes('\n')
	if err != nil {
		return fmt.Errorf("no answer from the server: %w", err)
	}
	_, err = out.Write(answer)
	return err
}
