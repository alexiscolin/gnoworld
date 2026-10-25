package main

import (
	"net"
	"testing"
)

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
