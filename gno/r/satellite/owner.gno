package satellite

import (
	"chain"
	"chain/banker"
	"math"
	"strconv"
)

const maxPrice = math.MaxInt64 / longest // ugnot a day: the longest rental's cost still fits an int

var pending address // the proposed owner, until it accepts (D14)

// mustOwner refuses anyone but the owner, the operator included.
func mustOwner(caller address) {
	if caller != owner {
		panic("only the owner may do this")
	}
}

func mustAddress(a address) {
	if !a.IsValid() {
		panic("not an address")
	}
}

// SetPrice sets the price of a day, in ugnot, for rentals to come: a rental
// keeps the price it paid. The owner only.
func SetPrice(cur realm, perDay int) {
	mustOwner(cur.Previous().Address())
	if perDay < 1 || perDay > maxPrice {
		panic("a price is 1 to " + strconv.Itoa(maxPrice) + " ugnot a day")
	}
	price = perDay
	chain.Emit("SetPrice", "price", strconv.Itoa(perDay))
}

// SetOperator names the address that may take satellites down besides the
// owner, or none with "". The owner only.
func SetOperator(cur realm, op address) {
	mustOwner(cur.Previous().Address())
	if op != "" {
		mustAddress(op)
	}
	operator = op
	chain.Emit("SetOperator", "operator", op.String())
}

// Pause stops new rentals; live ones fly on, and closes and takedowns go on.
// The owner only.
func Pause(cur realm) {
	mustOwner(cur.Previous().Address())
	paused = true
	chain.Emit("Pause")
}

// Unpause lets rentals start again. The owner only.
func Unpause(cur realm) {
	mustOwner(cur.Previous().Address())
	paused = false
	chain.Emit("Unpause")
}

// ProposeOwner names the next owner, who takes over by calling AcceptOwner
// (D14); a new proposal replaces the last. The owner only.
func ProposeOwner(cur realm, next address) {
	mustOwner(cur.Previous().Address())
	mustAddress(next)
	pending = next
	chain.Emit("ProposeOwner", "owner", next.String())
}

// AcceptOwner makes the proposed owner the owner. That address only.
func AcceptOwner(cur realm) {
	by := cur.Previous().Address()
	if by != pending {
		panic("only the proposed owner may accept")
	}
	chain.Emit("AcceptOwner", "previous", owner.String(), "owner", by.String())
	owner, pending = by, ""
}

// Withdraw sends amount ugnot to to, out of the realm's balance minus the
// payments of rentals not closed, which takedowns may refund (D13). The owner only.
func Withdraw(cur realm, to address, amount int) {
	mustOwner(cur.Previous().Address())
	mustAddress(to)
	free := int(banker.NewReadonlyBanker().GetCoin(cur.Address(), denom)) - held
	if amount < 1 || amount > free {
		panic("withdraw 1 to " + strconv.Itoa(free) + " ugnot")
	}
	banker.NewBanker(banker.BankerTypeRealmSend, cur).SendCoins(cur.Address(), to, coins(amount))
	chain.Emit("Withdraw", "to", to.String(), "amount", strconv.Itoa(amount))
}

// Price is the price of a day, in ugnot, for a rental starting now.
func Price() int { return price }

// Paused reports whether renting is paused.
func Paused() bool { return paused }

// Owner is the realm's owner: its deployer, until a handover.
func Owner() address { return owner }

// Operator is the address that may take satellites down besides the owner, or "".
func Operator() address { return operator }
