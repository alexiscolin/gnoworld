package satellite

import (
	"chain"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// The largest price whose seven days still fit an int64.
const topPrice = 1317624576693539401

func TestRentRefusedWhilePaused(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(adm))
	Pause(cross(cur))
	uassert.True(t, Paused())
	testing.SetRealm(testing.NewUserRealm(alice))
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "renting is paused", func() { Rent(cross(cur), "mars", "hello", 1) })
	uassert.Equal(t, 0, rentals.Size())

	testing.SetRealm(testing.NewUserRealm(adm))
	Unpause(cross(cur))
	uassert.False(t, Paused())
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	uassert.Equal(t, 1, rentals.Size())
}

// Pausing stops new rentals, never moderation: closes and takedowns go on.
func TestPauseLeavesCloseAndTakedown(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	pay(3 * p0)
	Rent(cross(cur), "venus", "hello", 3)
	testing.SetRealm(testing.NewUserRealm(adm))
	Pause(cross(cur))
	at(t0 + oneDay)
	testing.SetRealm(testing.NewUserRealm(carol))
	Close(cross(cur), "mars")
	testing.SetRealm(testing.NewUserRealm(mod))
	Takedown(cross(cur), "venus", "r1")
	uassert.Equal(t, p0, bal(alice))
	uassert.Equal(t, 0, rentals.Size())
	uassert.Equal(t, 0, held)
}

// A rental keeps the price it paid: a later price changes no refund.
func TestTakedownRefundsAtThePriceTheRentalPaid(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(adm))
	SetPrice(cross(cur), 1)
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3)
	Rent(cross(cur), "mars", "hello", 3)
	testing.SetRealm(testing.NewUserRealm(adm))
	SetPrice(cross(cur), 5*p0)
	at(t0 + oneDay)
	Takedown(cross(cur), "mars", "r1")
	uassert.Equal(t, 1, bal(alice))
	uassert.Equal(t, 2, bal(self))
	uassert.Equal(t, 0, held)
}

// A close takes out of the held total what the rental paid, not today's price.
func TestCloseReleasesWhatTheRentalPaid(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	testing.SetRealm(testing.NewUserRealm(adm))
	SetPrice(cross(cur), 5*p0)
	at(t0 + oneDay)
	Close(cross(cur), "mars")
	uassert.Equal(t, 0, held)
}

// Every owner action is refused to anyone else, the operator included.
func TestOwnerActionsRefusedToOthers(cur realm, t *testing.T) {
	fresh()
	for _, who := range []address{alice, mod} {
		testing.SetRealm(testing.NewUserRealm(who))
		const msg = "only the owner may do this"
		uassert.AbortsWithMessage(t, cur, msg, func() { SetPrice(cross(cur), 2*p0) }, who.String())
		uassert.AbortsWithMessage(t, cur, msg, func() { SetOperator(cross(cur), who) }, who.String())
		uassert.AbortsWithMessage(t, cur, msg, func() { Pause(cross(cur)) }, who.String())
		uassert.AbortsWithMessage(t, cur, msg, func() { Unpause(cross(cur)) }, who.String())
		uassert.AbortsWithMessage(t, cur, msg, func() { ProposeOwner(cross(cur), who) }, who.String())
		uassert.AbortsWithMessage(t, cur, msg, func() { Withdraw(cross(cur), who, 1) }, who.String())
	}
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/test/proxy"))
	uassert.AbortsWithMessage(t, cur, "only the owner may do this", func() { Pause(cross(cur)) })

	uassert.Equal(t, p0, Price())
	uassert.Equal(t, mod, Operator())
	uassert.Equal(t, adm, Owner())
	uassert.Equal(t, address(""), pending)
	uassert.False(t, Paused())
}

func TestSetPrice(cur realm, t *testing.T) {
	fresh()
	uassert.Equal(t, 1000000, Price()) // D3, at deploy
	testing.SetRealm(testing.NewUserRealm(adm))
	for _, p := range []int{0, -1, -p0, topPrice + 1} {
		uassert.AbortsWithMessage(t, cur, "a price is 1 to 1317624576693539401 ugnot a day", func() { SetPrice(cross(cur), p) })
	}
	uassert.Equal(t, p0, Price())
	for _, p := range []int{1, topPrice, 2 * p0} {
		SetPrice(cross(cur), p)
		uassert.Equal(t, p, Price())
	}

	testing.SetRealm(testing.NewUserRealm(alice))
	offer(chain.Coins{{"ugnot", p0}})
	uassert.AbortsWithMessage(t, cur, "send exactly 2000000ugnot", func() { Rent(cross(cur), "mars", "hello", 1) })
	pay(14 * p0)
	Rent(cross(cur), "mars", "hello", 7)
	uassert.Equal(t, 14*p0, held)
}

func TestSetOperator(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3 * p0)
	Rent(cross(cur), "mars", "hello", 3)

	testing.SetRealm(testing.NewUserRealm(adm))
	for _, a := range []address{"g1bad", "not an address", address(alice.String() + "x")} {
		uassert.AbortsWithMessage(t, cur, "not an address", func() { SetOperator(cross(cur), a) }, a.String())
	}
	uassert.Equal(t, mod, Operator())
	SetOperator(cross(cur), bob)
	uassert.Equal(t, bob, Operator())

	testing.SetRealm(testing.NewUserRealm(mod))
	uassert.AbortsWithMessage(t, cur, "only the owner or the operator takes a satellite down", func() { Takedown(cross(cur), "mars", "r1") })

	// None: the owner alone takes down.
	testing.SetRealm(testing.NewUserRealm(adm))
	SetOperator(cross(cur), "")
	uassert.Equal(t, address(""), Operator())
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "only the owner or the operator takes a satellite down", func() { Takedown(cross(cur), "mars", "r1") })

	testing.SetRealm(testing.NewUserRealm(adm))
	SetOperator(cross(cur), bob)
	testing.SetRealm(testing.NewUserRealm(bob))
	Takedown(cross(cur), "mars", "r1")
	_, _, _, ok := Rental("mars")
	uassert.False(t, ok)
}

// D14: the owner proposes, and only the proposed address takes over.
func TestOwnershipMovesInTwoSteps(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(adm))
	uassert.AbortsWithMessage(t, cur, "not an address", func() { ProposeOwner(cross(cur), "g1bad") })
	uassert.AbortsWithMessage(t, cur, "not an address", func() { ProposeOwner(cross(cur), "") })
	ProposeOwner(cross(cur), carol)
	ProposeOwner(cross(cur), bob) // a second proposal replaces the first
	uassert.Equal(t, adm, Owner())

	for _, who := range []address{carol, alice, mod, adm} {
		testing.SetRealm(testing.NewUserRealm(who))
		uassert.AbortsWithMessage(t, cur, "only the proposed owner may accept", func() { AcceptOwner(cross(cur)) }, who.String())
	}
	uassert.Equal(t, adm, Owner())

	testing.SetRealm(testing.NewUserRealm(bob))
	AcceptOwner(cross(cur))
	uassert.Equal(t, bob, Owner())
	uassert.Equal(t, address(""), pending)
	uassert.AbortsWithMessage(t, cur, "only the proposed owner may accept", func() { AcceptOwner(cross(cur)) })
	SetPrice(cross(cur), 2*p0)

	testing.SetRealm(testing.NewUserRealm(adm))
	uassert.AbortsWithMessage(t, cur, "only the owner may do this", func() { SetPrice(cross(cur), p0) })
	uassert.Equal(t, 2*p0, Price())
}

// D13: the owner withdraws the realm's balance minus the payments of rentals
// not closed, so every takedown can still refund.
func TestWithdrawNeverTakesHeldPayments(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3 * p0)
	Rent(cross(cur), "mars", "hello", 3)
	testing.IssueCoins(self, chain.Coins{{"ugnot", 5}}) // sent to the realm outside a rent

	testing.SetRealm(testing.NewUserRealm(adm))
	for _, n := range []int{6, 0, -1, -3 * p0} {
		uassert.AbortsWithMessage(t, cur, "withdraw 1 to 5 ugnot", func() { Withdraw(cross(cur), carol, n) })
	}
	uassert.AbortsWithMessage(t, cur, "not an address", func() { Withdraw(cross(cur), "g1bad", 1) })
	uassert.AbortsWithMessage(t, cur, "not an address", func() { Withdraw(cross(cur), "", 1) })
	Withdraw(cross(cur), carol, 1)
	Withdraw(cross(cur), carol, 4)
	uassert.Equal(t, 5, bal(carol))
	uassert.Equal(t, 3*p0, bal(self))
	uassert.AbortsWithMessage(t, cur, "withdraw 1 to 0 ugnot", func() { Withdraw(cross(cur), carol, 1) })

	// Day two has begun: the takedown refunds one day, and two are earned.
	at(t0 + oneDay)
	Takedown(cross(cur), "mars", "r1")
	uassert.Equal(t, p0, bal(alice))
	Withdraw(cross(cur), carol, 2*p0)
	uassert.Equal(t, 0, bal(self))
	uassert.Equal(t, 2*p0+5, bal(carol))
}

// An ended rental not yet closed is still held: its payer gets nothing back,
// but the owner withdraws it only once it is closed.
func TestWithdrawWaitsForTheClose(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	at(t0 + oneDay)
	testing.SetRealm(testing.NewUserRealm(adm))
	uassert.AbortsWithMessage(t, cur, "withdraw 1 to 0 ugnot", func() { Withdraw(cross(cur), adm, 1) })
	Close(cross(cur), "mars")
	Withdraw(cross(cur), adm, p0)
	uassert.Equal(t, p0, bal(adm))
}
