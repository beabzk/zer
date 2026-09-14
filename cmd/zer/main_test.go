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

func TestSeedDemoRequiresLocalBaseURLOrOverride(t *testing.T) {
	if !seedDemoAllowed("http://localhost:8080", "") {
		t.Error("expected local base URL to allow demo seed")
	}
	if seedDemoAllowed("https://zer.example.com", "") {
		t.Error("expected public base URL to reject demo seed")
	}
	if !seedDemoAllowed("https://zer.example.com", "1") {
		t.Error("expected explicit override to allow demo seed")
	}
}
