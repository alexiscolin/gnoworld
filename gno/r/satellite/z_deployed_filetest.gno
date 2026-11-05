// PKGPATH: gno.land/r/gnoworld/main
package main

import (
	"chain"
	"testing"

	"gno.land/r/gnoworld/satellite"
)

// The realm as deployed (D3, D14): renting paused at 2,000,000 ugnot a day,
// its deployer the owner, no operator. gno test deploys an imported realm
// from the empty address, which no test can call from: this file is the only
// test that sees init's state, and nothing here can unpause it.
func main(cur realm) {
	println(satellite.Paused(), satellite.Price(), satellite.Owner() == "", satellite.Operator() == "")
	testing.SetRealm(testing.NewUserRealm(chain.PackageAddress("gno.land/r/test/alice")))
	testing.SetOriginSend(chain.Coins{{"ugnot", 2000000}})
	println(revive(func() { satellite.Rent(cross(cur), "mars", "hello", 1) }))
	println(revive(func() { satellite.Unpause(cross(cur)) }))
	print(satellite.Render(""))
}

// Output:
// true 2000000 true true
// renting is paused
// only the owner may do this
// # Satellites
//
// Each world has one satellite slot, rented by the day.
//
// Price: 2000000 ugnot a day. Renting is paused.
//
// To rent one, call `Rent` with a world's id, a text of 1 to 40 characters and 1, 3 or 7 days, sending exactly the price times the days, in ugnot.
//
// ## Live satellites
//
// None on this page.

// Events:
// null
