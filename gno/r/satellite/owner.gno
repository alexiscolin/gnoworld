package satellite

import (
	"chain"
	"chain/banker"
	"math"
	"strconv"
)

const maxPrice = math.MaxInt64 / longest // ugnot a day; the highest price at which the longest rental's cost still fits an int

var pending address // the proposed owner, until they accept

// mustOwner panics unless the caller is the owner. The operator is refused too.
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

// SetPrice sets the price of a day, in ugnot, for future rentals. A rental
// keeps the price it paid. Only the owner may call it.
func SetPrice(cur realm, perDay int) {
	mustOwner(cur.Previous().Address())
	if perDay < 1 || perDay > maxPrice {
		panic("a price is 1 to " + strconv.Itoa(maxPrice) + " ugnot a day")
	}
	price = perDay
	chain.Emit("SetPrice", "price", strconv.Itoa(perDay))
}

// SetOperator names the address that may take satellites down besides the
// owner. Pass "" for no operator. Only the owner may call it.
func SetOperator(cur realm, op address) {
	mustOwner(cur.Previous().Address())
	if op != "" {
		mustAddress(op)
	}
	operator = op
	chain.Emit("SetOperator", "operator", op.String())
}

// Pause stops new rentals. Live rentals keep flying, and closes and takedowns
// still work. Only the owner may call it.
func Pause(cur realm) {
	mustOwner(cur.Previous().Address())
	paused = true
	chain.Emit("Pause")
}

// Unpause lets rentals start again. Only the owner may call it.
func Unpause(cur realm) {
	mustOwner(cur.Previous().Address())
	paused = false
	chain.Emit("Unpause")
}

// ProposeOwner names the next owner, who takes over by calling AcceptOwner.
// A new proposal replaces the previous one. Only the owner may call it.
func ProposeOwner(cur realm, next address) {
	mustOwner(cur.Previous().Address())
	mustAddress(next)
	pending = next
	chain.Emit("ProposeOwner", "owner", next.String())
}

// AcceptOwner makes the proposed owner the new owner. The operator stays in
// place, and the new owner can keep or change it. Only the proposed address may call it.
func AcceptOwner(cur realm) {
	by := cur.Previous().Address()
	if by != pending {
		panic("only the proposed owner may accept")
	}
	chain.Emit("AcceptOwner", "previous", owner.String(), "owner", by.String())
	owner, pending = by, ""
}

// Withdraw sends amount ugnot to the address to. It may only use the realm's balance
// minus the payments of rentals that are not closed yet, because a takedown may
// still refund those. Only the owner may call it.
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

// Price is the price of a day, in ugnot, for a rental that starts now.
func Price() int { return price }

// Paused reports whether renting is paused.
func Paused() bool { return paused }

// Owner is the realm's owner: its deployer, until a handover.
func Owner() address { return owner }

// Operator is the address that may take satellites down besides the owner, or "" if there is none.
func Operator() address { return operator }
