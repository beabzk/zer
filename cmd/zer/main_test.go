package main

import (
	"net"
	"testing"
)

func TestServerURLUsesBoundPort(t *testing.T) {
	addr := &net.TCPAddr{IP: net.IPv6zero, Port: 9123}

	if got, want := serverURL(addr), "http://localhost:9123"; got != want {
		t.Fatalf("serverURL() = %q, want %q", got, want)
	}
}
