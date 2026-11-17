// Package seal notarizes off-chain conversations. Messages never reach the
// chain: a seal records that two chat keys signed the same 32-byte transcript
// root, and when. Exercise copy: the version before the audit, unchanged.
package seal

import (
	"chain"
	"chain/runtime"
	"crypto/ed25519"
	"encoding/hex"
	"strconv"
	"strings"

	"gno.land/p/nt/avl/v0"
)

type Record struct {
	A, B string // hex chat keys
	N    int    // messages covered by the root
	At   int64  // block height
}

var (
	owner   avl.Tree // hex chat key -> address that proved it holds the key
	current avl.Tree // address -> its latest hex chat key
	kept    avl.Tree // hex root -> *Record
	count   avl.Tree // hex chat key -> int, kept seals it signed
)

// domain binds a signature to one chain, one realm and one action, so it cannot
// be replayed on another network, another deployment or as another call.
func domain(kind, path string) string {
	return "gnoworld/" + kind + "/v1|" + runtime.ChainID() + "|" + path + "|"
}

// Bind ties a chat key to the caller's address. sig is the key signing
// domain("bind") + caller, so nobody binds a key they do not hold, and a key
// holder's signature cannot bind the key to someone else's address.
// Binding is optional and can come after the key's first seals.
func Bind(cur realm, pub [32]byte, sig [64]byte) {
	caller := cur.Previous().Address()
	if !ed25519.Verify(pub[:], []byte(domain("bind", cur.PkgPath())+caller.String()), sig[:]) {
		panic("bad signature")
	}
	k := hex.EncodeToString(pub[:])
	if v := owner.Get(k); v != nil && v.(address) != caller {
		panic("key bound to another address")
	}
	owner.Set(k, caller)
	current.Set(caller.String(), k)
	chain.Emit("Bind", "addr", caller.String(), "key", k)
}

// Seal records that the holders of keys a and b agreed on root, the Merkle root
// of their first n messages. Anyone holding both signatures may submit it, so
// one party or a sponsor pays. With keep false it only emits an event (no
// storage deposit); with keep true it is also stored, readable by other realms.
func Seal(cur realm, root [32]byte, n int, a [32]byte, sigA [64]byte, b [32]byte, sigB [64]byte, keep bool) {
	if n < 1 {
		panic("n must be positive")
	}
	if a == b {
		panic("a seal needs two distinct keys")
	}
	msg := []byte(domain("seal", cur.PkgPath()) + string(root[:]) + "|" + strconv.Itoa(n))
	if !ed25519.Verify(a[:], msg, sigA[:]) || !ed25519.Verify(b[:], msg, sigB[:]) {
		panic("bad signature")
	}
	r, ka, kb := hex.EncodeToString(root[:]), hex.EncodeToString(a[:]), hex.EncodeToString(b[:])
	chain.Emit("Seal", "root", r, "n", strconv.Itoa(n), "a", ka, "b", kb, "kept", strconv.FormatBool(keep))
	if !keep {
		return
	}
	if kept.Has(r) {
		panic("already sealed")
	}
	kept.Set(r, &Record{A: ka, B: kb, N: n, At: runtime.ChainHeight()})
	inc(ka)
	inc(kb)
}

// Anchor timestamps a batch root, such as an app's daily root of roots. It
// names no participant: the submitter pays and is the only identity shown.
func Anchor(cur realm, root [32]byte) {
	chain.Emit("Anchor", "root", hex.EncodeToString(root[:]))
}

// KeyOf returns the address's latest bound chat key in hex, or "".
func KeyOf(addr address) string {
	if v := current.Get(addr.String()); v != nil {
		return v.(string)
	}
	return ""
}

// Seals returns how many kept seals the address's latest chat key signed.
// ponytail: a key rotation starts the count over; sum over past keys if it matters.
func Seals(addr address) int {
	return countOf(KeyOf(addr))
}

func inc(k string) { count.Set(k, countOf(k)+1) }

func countOf(k string) int {
	if v := count.Get(k); v != nil {
		return v.(int)
	}
	return 0
}

// Render serves "" (totals) and "root/<hex>" (one kept seal). The path is only
// used as a lookup key and never echoed.
func Render(path string) string {
	if !strings.HasPrefix(path, "root/") {
		return "# gnoworld seals\n\n" + strconv.Itoa(owner.Size()) + " bound keys · " + strconv.Itoa(kept.Size()) + " kept seals\n"
	}
	v := kept.Get(strings.TrimPrefix(path, "root/"))
	if v == nil {
		return "Not sealed here. Event-only seals are found through the indexer.\n"
	}
	r := v.(*Record)
	return "# Sealed at block " + strconv.FormatInt(r.At, 10) + "\n\n" + strconv.Itoa(r.N) + " messages, signed by:\n\n" +
		"- " + who(r.A) + "\n- " + who(r.B) + "\n"
}

func who(k string) string {
	if v := owner.Get(k); v != nil {
		return v.(address).String()
	}
	return "`" + k + "` (key not bound to an address yet)"
}
