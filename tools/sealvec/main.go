// Command sealvec is the reference client for r/seal's signing formats. It builds
// a 3-message transcript, its Merkle root (tm2 simple Merkle, the tree that
// crypto/merkle verifies in the VM), and the Bind/Seal signatures for
// deterministic test keys. Its output feeds seal_test.gno and on-chain calls.
//
//	go run ./tools/sealvec -chain dev -realm gno.land/r/gnoworld/seal -a g1... -b g1...
package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"flag"
	"fmt"
	"strconv"
)

func main() {
	chain := flag.String("chain", "dev", "chain id")
	realm := flag.String("realm", "gno.land/r/gnoworld/seal", "realm path")
	addrA := flag.String("a", "", "alice's address, for her Bind")
	addrB := flag.String("b", "", "bob's address, for his Bind")
	flag.Parse()

	alice, bob := key("alice"), key("bob")
	pubA, pubB := alice.Public().(ed25519.PublicKey), bob.Public().(ed25519.PublicKey)

	// Each leaf: salt(32) | sender key(32) | seq(8, BE) | previous leaf hash(32) | plaintext.
	texts := []string{"on se voit a 18h ?", "ok, devant la gare", "deal"}
	senders := []ed25519.PublicKey{pubA, pubB, pubA}
	var leaves [][]byte
	prev := make([]byte, 32)
	for i, t := range texts {
		salt := sha256.Sum256([]byte("salt" + strconv.Itoa(i)))
		leaf := append(append(salt[:], senders[i]...), binary.BigEndian.AppendUint64(nil, uint64(i))...)
		leaf = append(append(leaf, prev...), t...)
		leaves = append(leaves, leaf)
		prev = leafHash(leaf)
	}
	root := merkleRoot(leaves)
	var aunts []byte
	for _, a := range proof(leaves, 1) {
		aunts = append(aunts, a...)
	}

	prefix := func(kind string) string { return "gnoworld/" + kind + "/v1|" + *chain + "|" + *realm + "|" }
	// The seal statement names both keys, smaller first; Seal enforces that order.
	sealMsg := func(x, y ed25519.PublicKey) []byte {
		if string(x) > string(y) {
			x, y = y, x
		}
		return []byte(prefix("seal") + string(root) + string(x) + string(y) + "|" + strconv.Itoa(len(leaves)))
	}
	carol, alice2 := key("carol"), key("alice2")
	pubC, pubA2 := carol.Public().(ed25519.PublicKey), alice2.Public().(ed25519.PublicKey)

	b64 := base64.StdEncoding.EncodeToString
	out := [][2]string{
		{"pubA", b64(pubA)}, {"pubB", b64(pubB)}, {"pubC", b64(pubC)}, {"pubA2", b64(pubA2)},
		{"root", b64(root)}, {"n", strconv.Itoa(len(leaves))},
		{"sealSigA", b64(ed25519.Sign(alice, sealMsg(pubA, pubB)))}, {"sealSigB", b64(ed25519.Sign(bob, sealMsg(pubA, pubB)))},
		{"spliceSigC", b64(ed25519.Sign(carol, sealMsg(pubA, pubC)))}, // carol's half of a forged alice+carol seal
		{"bindSigA", b64(ed25519.Sign(alice, []byte(prefix("bind")+*addrA)))},
		{"bindSigA2", b64(ed25519.Sign(alice2, []byte(prefix("bind")+*addrA)))}, // alice rotates to a new key
		{"bindSigB", b64(ed25519.Sign(bob, []byte(prefix("bind")+*addrB)))},
		{"leaf0", b64(leaves[0])}, {"leaf1", b64(leaves[1])}, {"leaf2", b64(leaves[2])},
		{"aunts1", b64(aunts)},
	}
	for _, kv := range out {
		fmt.Printf("%s = %q\n", kv[0], kv[1])
	}
}

// key derives a deterministic test key. Real clients use ed25519.GenerateKey.
func key(name string) ed25519.PrivateKey {
	seed := sha256.Sum256([]byte("gnoworld test " + name))
	return ed25519.NewKeyFromSeed(seed[:])
}

func leafHash(b []byte) []byte { h := sha256.Sum256(append([]byte{0}, b...)); return h[:] }

func innerHash(l, r []byte) []byte {
	h := sha256.Sum256(append(append([]byte{1}, l...), r...))
	return h[:]
}

// split is tm2's: the largest power of two strictly below n.
func split(n int) int {
	k := 1
	for k*2 < n {
		k *= 2
	}
	return k
}

func merkleRoot(items [][]byte) []byte {
	if len(items) == 1 {
		return leafHash(items[0])
	}
	k := split(len(items))
	return innerHash(merkleRoot(items[:k]), merkleRoot(items[k:]))
}

// proof returns item i's aunts, leaf to root, as crypto/merkle.VerifySimpleProof wants them.
func proof(items [][]byte, i int) [][]byte {
	if len(items) == 1 {
		return nil
	}
	k := split(len(items))
	if i < k {
		return append(proof(items[:k], i), merkleRoot(items[k:]))
	}
	return append(proof(items[k:], i-k), merkleRoot(items[:k]))
}
