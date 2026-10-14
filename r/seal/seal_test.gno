package seal

import (
	"crypto/merkle"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// Vectors from: go run tools/sealvec/main.go -chain dev -realm gno.land/r/gnoworld/seal
//   -a g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 -b g1y2tswmrtlany2ffmpyc0uyunk4gt4gv8gtf736
const (
	alice      = address("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")
	bob        = address("g1y2tswmrtlany2ffmpyc0uyunk4gt4gv8gtf736")
	pubA       = "RhaRRVTy3t4chXmiCH2sNYp5JQgUXQNUdaYBTjKZ2Ho="
	pubB       = "uTh687ftqHUB4jeEwJbA8tB6Us8Ht3zK3Scg2uupjkU="
	pubC       = "+x5zGYxTbWerbUsPcxDKpy4qjIhNOVaH8hY54VDkIo4="
	pubA2      = "U2zhNN5yayKtWUCFJpWXROfFoqWdj0CqqEuAULisFgE="
	root       = "CGPhwls7MbIE/rBKsbd1waylah7i4FoRwkjDTAZ937s="
	sealSigA   = "mrO1fcXQ2Fx2KwSuPf6T7pP2QdkFnbQAdJ0KoeQV2vPPVKDmoCcgtAieIq11YDXS3qSHoQtsxhzkmhTMJgW3Aw=="
	sealSigB   = "zURubTEEbHsJpIe9q4ALyuVRXfnADRWMHdA1yBDlBrUQBs/NyaCnkpc/w1WjAD5GrJvv12yDGwLhItbLYdd/AA=="
	spliceSigC = "NjvzBwSd+E7zXDo8ebRRtTCiYgr9VtADiv/mpDWLYxukKO/Vupsft53Y2+uzQnudi+UbyxTHgqAySN6guxxsBA=="
	bindSigA   = "dXJMxwWz4W/NUmXX/e1+38KULmhxwnMRo+HGqQArzEaWslOME+w2teFsbriQcUpYAwpR4qVwZhx47g+2WrgHAw=="
	bindSigA2  = "g1v0BPJgix8tfH4HgvvxFbCH3NBYD5Oe1STukskoDbM6U9xuoBtBfgo8tT0o7QfVmglleIQQtaEOpkR3DqksAg=="
	leaf0      = "K8mQBZRzRI5uvUQqoWv6oFZ6wD3QlIdr2x/YNKvkLB5GFpFFVPLe3hyFeaIIfaw1inklCBRdA1R1pgFOMpnYegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABvbiBzZSB2b2l0IGEgMThoID8="
	leaf1      = "3JDPB96QfMxkY2zt2zjlUqGg2YR0Ox82pEe3OHcBLDm5OHrzt+2odQHiN4TAlsDy0HpSzwe3fMrdJyDa66mORQAAAAAAAAABIoLKrqUK9WKd/5S89ExtyTKwlJInXWGQH6gE6MLKU8hvaywgZGV2YW50IGxhIGdhcmU="
	leaf2      = "28RXmuKzqykyE/QruFJwbqmVw7XDmH+KqfquUASss89GFpFFVPLe3hyFeaIIfaw1inklCBRdA1R1pgFOMpnYegAAAAAAAAACJTLCKlyifqnHn43n55S0liMr0XuAI0yGKH7DM4GeC+5kZWFs"
	aunts1     = "IoLKrqUK9WKd/5S89ExtyTKwlJInXWGQH6gE6MLKU8h32nRd4SK6wjunTtsOHqX7ElZJtBr9WsRp5Q2IaC19UA=="
	rootHex    = "0863e1c25b3b31b204feb04ab1b775c1aca56a1ee2e05a11c248c34c067ddfbb"
)

func raw(s string) []byte {
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func k32(s string) (a [32]byte) { copy(a[:], raw(s)); return }
func s64(s string) (a [64]byte) { copy(a[:], raw(s)); return }

// The client's tree is the chain's tree: the root a Go client computes is the
// one crypto/merkle computes, and one message is provable without the others.
func TestMerkleCompat(t *testing.T) {
	enc := []byte{0, 0, 0, 3}
	for _, l := range []string{leaf0, leaf1, leaf2} {
		b := raw(l)
		enc = append(enc, 0, 0, byte(len(b)>>8), byte(len(b)))
		enc = append(enc, b...)
	}
	uassert.Equal(t, root, base64.StdEncoding.EncodeToString(merkle.HashFromByteSlices(enc)))
	uassert.True(t, merkle.VerifySimpleProof(raw(root), raw(leaf1), 1, 3, raw(aunts1)))
	uassert.False(t, merkle.VerifySimpleProof(raw(root), raw(leaf0), 1, 3, raw(aunts1)))
}

// The identity point (and its non-canonical spelling with the sign bit set)
// accepts this signature for any message, with no private key: see mustStrong.
func TestWeakKeys(cur realm, t *testing.T) {
	var forged [64]byte
	forged[0] = 1
	var id, idSigned [32]byte
	id[0], idSigned[0], idSigned[31] = 1, 1, 0x80

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "weak key", func() { Bind(cross(cur), id, forged) })
	uassert.AbortsWithMessage(t, cur, "weak key", func() { Bind(cross(cur), idSigned, forged) })
	uassert.AbortsWithMessage(t, cur, "weak key", func() { Seal(cross(cur), k32(root), 3, id, forged, k32(pubA), forged, false) })

	// libsodium's small-order blocklist, in hex, against mustStrong's byte literals.
	for _, h := range []string{
		strings.Repeat("00", 32), "01" + strings.Repeat("00", 31),
		"26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
		"c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
		"ec" + strings.Repeat("ff", 30) + "7f", "ed" + strings.Repeat("ff", 30) + "7f", "ee" + strings.Repeat("ff", 30) + "7f",
	} {
		var k [32]byte
		b, _ := hex.DecodeString(h)
		copy(k[:], b)
		uassert.PanicsWithMessage(t, cur, "weak key", func() { mustStrong(k) }, h)
	}
	mustStrong(k32(pubA))
}

func TestBind(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "bad signature", func() { Bind(cross(cur), k32(pubA), s64(bindSigA)) })

	testing.SetRealm(testing.NewUserRealm(alice))
	Bind(cross(cur), k32(pubA), s64(bindSigA))
	uassert.Equal(t, "461691", KeyOf(alice)[:6])
	uassert.Equal(t, "", KeyOf(bob))
}

func TestSeal(cur realm, t *testing.T) {
	r, a, b, c, sa, sb := k32(root), k32(pubA), k32(pubB), k32(pubC), s64(sealSigA), s64(sealSigB)
	testing.SetRealm(testing.NewUserRealm(bob))

	uassert.AbortsWithMessage(t, cur, "bad signature", func() { Seal(cross(cur), r, 4, a, sa, b, sb, true) })
	uassert.AbortsWithMessage(t, cur, "bad signature", func() { Seal(cross(cur), r, 3, a, sb, b, sa, true) })
	// Alice's real signature cannot be paired with another key: the statement names both.
	uassert.AbortsWithMessage(t, cur, "bad signature", func() { Seal(cross(cur), r, 3, a, sa, c, s64(spliceSigC), true) })
	uassert.AbortsWithMessage(t, cur, "keys must be distinct and sorted (a < b)", func() { Seal(cross(cur), r, 3, b, sb, a, sa, true) })
	uassert.AbortsWithMessage(t, cur, "keys must be distinct and sorted (a < b)", func() { Seal(cross(cur), r, 3, a, sa, a, sa, true) })

	Seal(cross(cur), r, 3, a, sa, b, sb, false)
	uassert.Equal(t, 0, kept.Size())

	Seal(cross(cur), r, 3, a, sa, b, sb, true)
	n, h, ok := Kept(r, a, b)
	uassert.True(t, ok)
	uassert.Equal(t, 3, n)
	uassert.True(t, h > 0)
	_, _, ok = Kept(r, a, c)
	uassert.False(t, ok)
	uassert.Equal(t, 1, Seals(alice))
	uassert.AbortsWithMessage(t, cur, "already sealed", func() { Seal(cross(cur), r, 3, a, sa, b, sb, true) })

	out := Render("root/" + rootHex)
	uassert.True(t, strings.Contains(out, "3 messages"), out)
	uassert.True(t, strings.Contains(out, alice.String()), out)
	uassert.True(t, strings.Contains(out, "unbound key"), out)
	uassert.True(t, strings.Contains(Render("root/"+strings.Repeat("0", 64)), "Not kept"))

	Anchor(cross(cur), r)
}

// Binding a new key revokes the old one: a stolen old key can no longer seal.
func TestRotationRevokes(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	Bind(cross(cur), k32(pubA2), s64(bindSigA2))
	uassert.Equal(t, "536ce1", KeyOf(alice)[:6])

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "key rotated out", func() {
		Seal(cross(cur), k32(root), 3, k32(pubA), s64(sealSigA), k32(pubB), s64(sealSigB), false)
	})
}
