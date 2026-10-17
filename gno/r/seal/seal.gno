// Package seal notarizes off-chain conversations. Messages never reach the
// chain: a seal records that two chat keys signed the same 32-byte transcript
// root, and when. Signing formats: adr/0001-gnoworld.md and the reference
// client in tools/sealvec.
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

var (
	owner   avl.Tree // hex chat key -> address that proved it holds the key
	current avl.Tree // address -> its latest hex chat key
	kept    avl.Tree // hex root+keyA+keyB -> "n height"; a string, not a struct: storage is billed per object
	count   avl.Tree // hex chat key -> int, kept seals it signed
)

// domain binds a signature to one chain, one realm and one action, so it cannot
// be replayed on another network, another deployment or as another call.
func domain(kind, path string) string {
	return "gnoworld/" + kind + "/v1|" + runtime.ChainID() + "|" + path + "|"
}

// Bind ties a chat key to the caller's address. sig is the key signing
// domain("bind") + caller, so nobody binds a key they do not hold, and a key
// holder's signature cannot bind the key to someone else's address. Only the
// master key may bind: a session must not be able to swap the user's chat key.
// Binding a new key retires the previous one for future seals.
func Bind(cur realm, pub [32]byte, sig [64]byte) {
	if _, _, _, isSession := runtime.GetSessionInfo(); isSession {
		panic("bind with the master key, not a session")
	}
	mustStrong(pub)
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

// Seal records that the holders of keys a and b (a < b bytewise) agreed on
// root, the Merkle root of their first n messages. Both keys are in the signed
// statement, so a signature cannot be paired with another key. Anyone holding
// both signatures may submit it, so one party or a sponsor pays. With keep
// false it only emits an event (no storage deposit); with keep true it is also
// stored, readable by other realms through Kept.
func Seal(cur realm, root [32]byte, n int, a [32]byte, sigA [64]byte, b [32]byte, sigB [64]byte, keep bool) {
	if n < 1 {
		panic("n must be positive")
	}
	if string(a[:]) >= string(b[:]) {
		panic("keys must be distinct and sorted (a < b)")
	}
	mustStrong(a)
	mustStrong(b)
	msg := []byte(domain("seal", cur.PkgPath()) + string(root[:]) + string(a[:]) + string(b[:]) + "|" + strconv.Itoa(n))
	if !ed25519.Verify(a[:], msg, sigA[:]) || !ed25519.Verify(b[:], msg, sigB[:]) {
		panic("bad signature")
	}
	r, ka, kb := hex.EncodeToString(root[:]), hex.EncodeToString(a[:]), hex.EncodeToString(b[:])
	mustBeCurrent(ka)
	mustBeCurrent(kb)
	chain.Emit("Seal", "root", r, "n", strconv.Itoa(n), "a", ka, "b", kb, "kept", strconv.FormatBool(keep))
	if !keep {
		return
	}
	id := r + ka + kb
	if kept.Has(id) {
		panic("already sealed")
	}
	kept.Set(id, strconv.Itoa(n)+" "+strconv.FormatInt(runtime.ChainHeight(), 10))
	inc(ka)
	inc(kb)
}

// Anchor timestamps a batch root, such as an app's daily root of roots. It
// names no participant, only the submitter.
func Anchor(cur realm, root [32]byte) {
	chain.Emit("Anchor", "root", hex.EncodeToString(root[:]), "by", cur.Previous().Address().String())
}

// Kept reports whether keys a and b kept a seal of root, with its message count
// and block height.
func Kept(root, a, b [32]byte) (n int, height int64, ok bool) {
	v := kept.Get(hex.EncodeToString(root[:]) + hex.EncodeToString(a[:]) + hex.EncodeToString(b[:]))
	if v == nil {
		return 0, 0, false
	}
	f := strings.Fields(v.(string))
	n, _ = strconv.Atoi(f[0])
	height, _ = strconv.ParseInt(f[1], 10, 64)
	return n, height, true
}

// KeyOf returns the address's latest bound chat key in hex, or "".
func KeyOf(addr address) string {
	if v := current.Get(addr.String()); v != nil {
		return v.(string)
	}
	return ""
}

// Seals returns how many kept seals the address's latest chat key signed. One
// person can seal between two of their own keys: a signal, not proof of humanity.
// ponytail: a key rotation starts the count over; sum over past keys if it matters.
func Seals(addr address) int {
	return countOf(KeyOf(addr))
}

// mustBeCurrent refuses a key its owner has rotated away from, so binding a new
// key is how a stolen one is revoked. Unbound keys pass: binding is optional.
func mustBeCurrent(k string) {
	if v := owner.Get(k); v != nil && KeyOf(v.(address)) != k {
		panic("key rotated out")
	}
}

// Constant expressions, folded before execution: building these at call time
// tripled Seal's gas.
const (
	z8  = "\x00\x00\x00\x00\x00\x00\x00\x00"
	z31 = z8 + z8 + z8 + "\x00\x00\x00\x00\x00\x00\x00"
	f8  = "\xff\xff\xff\xff\xff\xff\xff\xff"
	f30 = f8 + f8 + f8 + "\xff\xff\xff\xff\xff\xff"
)

// mustStrong refuses the small-order points (libsodium's blocklist, sign bit
// ignored): Go's ed25519.Verify accepts signatures forged without any private
// key for them.
func mustStrong(k [32]byte) {
	k[31] &= 0x7f
	switch string(k[:]) {
	case "\x00" + z31, "\x01" + z31,
		"\x26\xe8\x95\x8f\xc2\xb2\x27\xb0\x45\xc3\xf4\x89\xf2\xef\x98\xf0\xd5\xdf\xac\x05\xd3\xc6\x33\x39\xb1\x38\x02\x88\x6d\x53\xfc\x05",
		"\xc7\x17\x6a\x70\x3d\x4d\xd8\x4f\xba\x3c\x0b\x76\x0d\x10\x67\x0f\x2a\x20\x53\xfa\x2c\x39\xcc\xc6\x4e\xc7\xfd\x77\x92\xac\x03\x7a",
		"\xec" + f30 + "\x7f", "\xed" + f30 + "\x7f", "\xee" + f30 + "\x7f":
		panic("weak key")
	}
}

func inc(k string) { count.Set(k, countOf(k)+1) }

func countOf(k string) int {
	if v := count.Get(k); v != nil {
		return v.(int)
	}
	return 0
}

// Render serves "" (totals) and "root/<hex>" (up to 10 kept seals of that root;
// each pair signed it, so check the pair you care about). The path is only used
// as a lookup prefix and never echoed.
func Render(path string) string {
	if !strings.HasPrefix(path, "root/") {
		return "# gnoworld seals\n\n" + strconv.Itoa(owner.Size()) + " bound keys · " + strconv.Itoa(kept.Size()) + " kept seals\n"
	}
	r := strings.TrimPrefix(path, "root/")
	if len(r) != 64 {
		return "A root is 64 hex characters.\n"
	}
	var b strings.Builder
	shown := 0
	kept.Iterate(r, r+"g", func(id string, v any) bool {
		f := strings.Fields(v.(string))
		b.WriteString("- block " + f[1] + ", " + f[0] + " messages: " + who(id[64:128]) + " and " + who(id[128:]) + "\n")
		shown++
		return shown == 10
	})
	if shown == 0 {
		return "Not kept here. Event-only seals are found through the indexer.\n"
	}
	return "# Kept seals of this root\n\n" + b.String()
}

func who(k string) string {
	if v := owner.Get(k); v != nil {
		return v.(address).String()
	}
	return "`" + k + "` (unbound key)"
}
