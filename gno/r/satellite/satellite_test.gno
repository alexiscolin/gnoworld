package satellite

import (
	"chain"
	"chain/banker"
	"chain/runtime"
	"strings"
	"testing"
	"time"

	"gno.land/p/nt/avl/v0"
	"gno.land/p/nt/uassert/v0"
)

// Addresses derived from paths: valid, and no key behind them.
var (
	adm   = chain.PackageAddress("gno.land/r/test/owner")
	mod   = chain.PackageAddress("gno.land/r/test/operator")
	alice = chain.PackageAddress("gno.land/r/test/alice")
	bob   = chain.PackageAddress("gno.land/r/test/bob")
	carol = chain.PackageAddress("gno.land/r/test/carol")
	self  = chain.PackageAddress("gno.land/r/gnoworld/satellite")
)

// The tests' own numbers, never the realm's constants, so a changed constant fails them.
const (
	t0     = 1800000000 // 2027-01-15 08:00:00 UTC, when every test starts
	oneDay = 86400
	p0     = 1000000 // ugnot a day at deploy (D3)
)

// fresh puts the realm as a deploy by adm leaves it, with renting opened and
// mod named operator, at t0. Every test starts with it, so none depends on
// another's state (F061). It sets no caller: testing.SetRealm only holds in
// the test function that calls it.
func fresh() {
	rentals, payers = avl.Tree{}, avl.Tree{}
	held, price, paused = 0, startPrice, false
	owner, pending, operator = adm, "", mod
	at(t0)
}

// at sets the block time, keeping the caller and the coins sent.
func at(sec int) {
	ctx := testing.GetContext()
	ctx.Time = time.Unix(int64(sec), 0)
	testing.SetContext(ctx)
}

// pay sends n ugnot with the next call, credited to the realm before it runs,
// as the chain does.
func pay(n int) {
	coins := chain.Coins{{"ugnot", int64(n)}}
	testing.SetOriginSend(coins)
	testing.IssueCoins(self, coins)
}

// offer sends coins with a call that must be refused: a refused call's
// credit is reverted on chain, so it is not credited here.
func offer(coins chain.Coins) { testing.SetOriginSend(coins) }

func bal(a address) int { return int(banker.NewReadonlyBanker().GetCoin(a, "ugnot")) }

// worlds returns n distinct valid world ids.
func worlds(n int) []string {
	ws := make([]string, n)
	for i := range ws {
		ws[i] = "w" + string(rune('a'+i/26)) + string(rune('a'+i%26))
	}
	return ws
}

func TestRentNeedsExactlyThePriceInOneUgnotCoin(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	for _, sent := range []chain.Coins{
		nil,
		{{"ugnot", p0 - 1}},
		{{"ugnot", p0 + 1}},
		{{"uatom", p0}},
		{{"ugnot", p0}, {"uatom", 1}},
		{{"uatom", 1}, {"ugnot", p0}},
	} {
		offer(sent)
		uassert.AbortsWithMessage(t, cur, "send exactly 1000000ugnot", func() { Rent(cross(cur), "mars", "hello", 1) }, sent.String())
	}
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "send exactly 3000000ugnot", func() { Rent(cross(cur), "mars", "hello", 3) })
	uassert.Equal(t, 0, rentals.Size())
	uassert.Equal(t, 0, held)

	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	pay(3 * p0)
	Rent(cross(cur), "venus", "hello", 3)
	uassert.Equal(t, 4*p0, held)
	uassert.Equal(t, 2, rentals.Size())
}

// A realm between the wallet and Rent could spend the coins sent first, and so
// could a `maketx run` script (NewCodeRealm takes no run path: runtime.NewRealm).
func TestRentFromCodeRefused(cur realm, t *testing.T) {
	fresh()
	for _, caller := range []runtime.Realm{
		testing.NewCodeRealm("gno.land/r/test/proxy"),
		runtime.NewRealm(alice, "gno.land/e/"+alice.String()+"/run"),
	} {
		testing.SetRealm(caller)
		pay(p0)
		uassert.AbortsWithMessage(t, cur, "rent from a wallet, not from code", func() { Rent(cross(cur), "mars", "hello", 1) }, caller.PkgPath())
	}
	uassert.Equal(t, 0, rentals.Size())
}

func TestRentDaysAreOneThreeOrSeven(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	for _, d := range []int{-1, 0, 2, 4, 5, 6, 8, 30} {
		offer(chain.Coins{{"ugnot", p0}})
		uassert.AbortsWithMessage(t, cur, "days are 1, 3 or 7", func() { Rent(cross(cur), "mars", "hello", d) })
	}
	for i, d := range []int{1, 3, 7} {
		w := worlds(3)[i]
		pay(d * p0)
		Rent(cross(cur), w, "hello", d)
		_, _, end, ok := Rental(w)
		uassert.True(t, ok)
		uassert.Equal(t, t0+d*oneDay, end)
	}
	uassert.Equal(t, 11*p0, held)
}

func TestRentWorldIsASlugOfFortyBytesAtMost(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	for _, w := range []string{
		"", strings.Repeat("a", 41), strings.Repeat("ab-", 13) + "ab",
		"-mars", "mars-", "ma--rs", "-", "Mars", "mArs", "ma_rs", "ma rs", "mars/1", "mars:1", "mars?page=2",
		"é", "mars\n", "m`", "m{", "m/", "m:", "m@", "m[",
	} {
		offer(chain.Coins{{"ugnot", p0}})
		uassert.AbortsWithMessage(t, cur, "not a world's id", func() { Rent(cross(cur), w, "hello", 1) }, w)
	}
	uassert.Equal(t, 0, rentals.Size())

	// The alphabet's four ends, a hyphen inside, one byte, forty bytes.
	for i, w := range []string{"a", "az09-z", strings.Repeat("ab-", 13) + "a", "9"} {
		if i == 3 {
			testing.SetRealm(testing.NewUserRealm(bob))
		}
		pay(p0)
		Rent(cross(cur), w, "hello", 1)
		_, _, _, ok := Rental(w)
		uassert.True(t, ok, w)
	}
}

func TestRentTextIsOneToFortyCodePointsWithNoControl(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	for _, text := range []string{
		"", strings.Repeat("a", 41), strings.Repeat("é", 41),
		"a\nb", "a\rb", "a\tb", "\x00", "a\x7f", "a\u0085b", "a\u009fb", "\x1b[31m",
		"\xff", "ab\xc3", "\xed\xa0\x80",
	} {
		offer(chain.Coins{{"ugnot", p0}})
		uassert.AbortsWithMessage(t, cur, "not a satellite's text", func() { Rent(cross(cur), "mars", text, 1) }, text)
	}
	uassert.Equal(t, 0, rentals.Size())

	// One code point, forty of two bytes each, forty of one, and spaces kept.
	good := []string{"a", strings.Repeat("é", 40), strings.Repeat("z", 40), " hello  big world "}
	who := []address{alice, alice, alice, bob}
	for i, text := range good {
		testing.SetRealm(testing.NewUserRealm(who[i]))
		pay(p0)
		Rent(cross(cur), worlds(4)[i], text, 1)
		_, got, _, _ := Rental(worlds(4)[i])
		uassert.Equal(t, text, got)
	}
}

// D5: three live satellites per address; an ended one no longer counts, and
// the next rent closes it.
func TestRentFourthLiveSatelliteRefused(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	for i, d := range []int{1, 3, 7} {
		pay(d * p0)
		Rent(cross(cur), worlds(3)[i], "hello", d)
	}
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "too many live satellites for this address", func() { Rent(cross(cur), "mars", "hello", 1) })

	testing.SetRealm(testing.NewUserRealm(bob))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)

	// The one-day rental is live until its last second, and ended at the next.
	at(t0 + oneDay - 1)
	testing.SetRealm(testing.NewUserRealm(alice))
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "too many live satellites for this address", func() { Rent(cross(cur), "venus", "hello", 1) })
	at(t0 + oneDay)
	pay(p0)
	Rent(cross(cur), "venus", "hello", 1)
	uassert.False(t, rentals.Has(worlds(3)[0]))
	uassert.Equal(t, worlds(3)[1]+" "+worlds(3)[2]+" venus", payers.Get(alice.String()))
	uassert.Equal(t, 3*p0+7*p0+p0+p0, held) // alice's three live, and bob's ended mars until it is closed
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "too many live satellites for this address", func() { Rent(cross(cur), "jupiter", "hello", 1) })
}

// Closing one of three rentals leaves the other two counted.
func TestCloseKeepsThePayersOtherRentals(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	for i, d := range []int{3, 1, 3} {
		pay(d * p0)
		Rent(cross(cur), worlds(3)[i], "hello", d)
	}
	at(t0 + oneDay)
	testing.SetRealm(testing.NewUserRealm(carol))
	Close(cross(cur), worlds(3)[1])
	uassert.Equal(t, worlds(3)[0]+" "+worlds(3)[2], payers.Get(alice.String()))

	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "too many live satellites for this address", func() { Rent(cross(cur), "venus", "hello", 1) })
}

// Two rents of one world in one block give one rental.
func TestOneSatellitePerWorld(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "first", 1)
	testing.SetRealm(testing.NewUserRealm(bob))
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "this world has a satellite", func() { Rent(cross(cur), "mars", "second", 1) })
	at(t0 + oneDay - 1)
	uassert.AbortsWithMessage(t, cur, "this world has a satellite", func() { Rent(cross(cur), "mars", "second", 1) })

	payer, text, end, ok := Rental("mars")
	uassert.Equal(t, alice, payer)
	uassert.Equal(t, "first", text)
	uassert.Equal(t, t0+oneDay, end)
	uassert.True(t, ok)
	uassert.Equal(t, 1, rentals.Size())
	uassert.Equal(t, p0, held)
	uassert.False(t, payers.Has(bob.String()))
}

func TestRentalEndsAfterItsDays(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3 * p0)
	Rent(cross(cur), "mars", "hello", 3)
	at(t0 + 3*oneDay - 1)
	payer, text, end, ok := Rental("mars")
	uassert.Equal(t, alice, payer)
	uassert.Equal(t, "hello", text)
	uassert.Equal(t, t0+3*oneDay, end)
	uassert.True(t, ok)

	at(t0 + 3*oneDay)
	payer, text, end, ok = Rental("mars")
	uassert.Equal(t, address(""), payer)
	uassert.Equal(t, "", text)
	uassert.Equal(t, 0, end)
	uassert.False(t, ok)
	_, _, _, ok = Rental("venus")
	uassert.False(t, ok)
}

// Anyone closes an ended rental; storage then holds nothing of it (D2).
func TestCloseFreesAnEndedRental(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "this world's rental has not ended", func() { Close(cross(cur), "mars") })
	at(t0 + oneDay - 1)
	uassert.AbortsWithMessage(t, cur, "this world's rental has not ended", func() { Close(cross(cur), "mars") })
	uassert.AbortsWithMessage(t, cur, "no rental on this world", func() { Close(cross(cur), "venus") })
	uassert.Equal(t, p0, held)

	at(t0 + oneDay)
	Close(cross(cur), "mars")
	uassert.Equal(t, 0, rentals.Size())
	uassert.Equal(t, 0, payers.Size())
	uassert.Equal(t, 0, held)
	uassert.Equal(t, p0, bal(self)) // earned, now free to withdraw
	uassert.AbortsWithMessage(t, cur, "no rental on this world", func() { Close(cross(cur), "mars") })

	testing.SetRealm(testing.NewUserRealm(bob))
	pay(p0)
	Rent(cross(cur), "mars", "again", 1)
	payer, _, _, ok := Rental("mars")
	uassert.Equal(t, bob, payer)
	uassert.True(t, ok)
}

// A rent on a world whose rental ended closes it in place.
func TestRentClosesAnEndedRentalInPlace(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "first", 1)
	at(t0 + oneDay)
	testing.SetRealm(testing.NewUserRealm(bob))
	pay(3 * p0)
	Rent(cross(cur), "mars", "second", 3)

	payer, text, end, _ := Rental("mars")
	uassert.Equal(t, bob, payer)
	uassert.Equal(t, "second", text)
	uassert.Equal(t, t0+4*oneDay, end)
	uassert.Equal(t, 3*p0, held)
	uassert.False(t, payers.Has(alice.String()))
	uassert.Equal(t, "mars", payers.Get(bob.String()))
}

// Renting again one's own ended world closes it once, not twice.
func TestRentAgainOwnEndedWorld(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "first", 1)
	at(t0 + oneDay)
	pay(p0)
	Rent(cross(cur), "mars", "second", 1)
	uassert.Equal(t, p0, held)
	uassert.Equal(t, "mars", payers.Get(alice.String()))
	_, text, end, _ := Rental("mars")
	uassert.Equal(t, "second", text)
	uassert.Equal(t, t0+2*oneDay, end)
}

func TestTakedownByOwnerOrOperatorOnly(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3 * p0)
	Rent(cross(cur), "mars", "hello", 3)
	for _, who := range []address{alice, bob, self} {
		testing.SetRealm(testing.NewUserRealm(who))
		uassert.AbortsWithMessage(t, cur, "only the owner or the operator takes a satellite down", func() { Takedown(cross(cur), "mars", "r1") }, who.String())
	}
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/test/proxy"))
	uassert.AbortsWithMessage(t, cur, "only the owner or the operator takes a satellite down", func() { Takedown(cross(cur), "mars", "r1") })
	uassert.Equal(t, 1, rentals.Size())

	testing.SetRealm(testing.NewUserRealm(mod))
	Takedown(cross(cur), "mars", "r1")
	uassert.Equal(t, 0, rentals.Size())

	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3 * p0)
	Rent(cross(cur), "mars", "hello", 3)
	testing.SetRealm(testing.NewUserRealm(adm))
	Takedown(cross(cur), "mars", "r2")
	uassert.Equal(t, 0, rentals.Size())
	uassert.Equal(t, 0, payers.Size())
	uassert.Equal(t, 0, held)
}

// D12: the whole days not yet begun come back to the payer at once; the day
// under way counts as begun from its first second.
func TestTakedownRefundsTheWholeDaysNotBegun(cur realm, t *testing.T) {
	for _, c := range []struct{ days, after, refund int }{
		{3, 0, 2 * p0},
		{3, oneDay - 1, 2 * p0},
		{3, oneDay, p0},
		{3, 2*oneDay - 1, p0},
		{3, 2 * oneDay, 0},
		{3, 3*oneDay - 1, 0},
		{7, 0, 6 * p0},
		{7, 5*oneDay + 7, p0},
		{1, 0, 0},
	} {
		fresh()
		testing.SetRealm(testing.NewUserRealm(alice))
		pay(c.days * p0)
		Rent(cross(cur), "mars", "hello", c.days)
		at(t0 + c.after)
		testing.SetRealm(testing.NewUserRealm(mod))
		before, kept := bal(alice), bal(self)-c.days*p0 // the banker lives the whole test, past fresh()
		Takedown(cross(cur), "mars", "r1")
		uassert.Equal(t, c.refund, bal(alice)-before)
		uassert.Equal(t, c.days*p0-c.refund, bal(self)-kept)
		uassert.Equal(t, 0, held)
	}
}

func TestTakedownOnlyALiveRental(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	testing.SetRealm(testing.NewUserRealm(mod))
	uassert.AbortsWithMessage(t, cur, "no live satellite on this world", func() { Takedown(cross(cur), "venus", "r1") })
	at(t0 + oneDay)
	uassert.AbortsWithMessage(t, cur, "no live satellite on this world", func() { Takedown(cross(cur), "mars", "r1") })
	uassert.Equal(t, 0, bal(alice))
	uassert.Equal(t, p0, held)
}

func TestTakedownReportIsAnId(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	testing.SetRealm(testing.NewUserRealm(mod))
	for _, r := range []string{"", strings.Repeat("a", 65), "R1", "r 1", "r_1", "-r1", "r1-", "r--1", "r1\n"} {
		uassert.AbortsWithMessage(t, cur, "not a report's id", func() { Takedown(cross(cur), "mars", r) }, r)
	}
	uassert.Equal(t, 1, rentals.Size())
	Takedown(cross(cur), "mars", strings.Repeat("r1-", 21)+"z")
	uassert.Equal(t, 0, rentals.Size())
}
