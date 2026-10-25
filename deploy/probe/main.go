// The stack's health probe (slice 3's plan, 3e): Ergo's and the way out's images have no shell or tool that
// dials a port, so this does: `probe <host:port>` answers 0 when something listens there, else 1.
package main

import (
	"fmt"
	"net"
	"os"
	"time"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: probe <host:port>")
		os.Exit(2)
	}
	os.Exit(probe(os.Args[1]))
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
