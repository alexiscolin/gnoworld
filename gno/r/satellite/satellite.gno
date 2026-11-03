// Package satellite rents each world's satellite slot by the day: anyone rents
// a free slot by paying, the owner or its operator takes a satellite down after
// a report and refunds its days not begun. Design: docs/plans/slice-11.md.
package satellite

import (
	"chain"
	"chain/banker"
	"chain/runtime/unsafe"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gno.land/p/nt/avl/v0"
)

const (
	denom      = "ugnot"
	day        = 86400       // seconds of block time in a rental's day (D11)
	longest    = 7           // days, the longest rental
	perPayer   = 3           // live satellites one address holds at most (D5)
	maxWorld   = 40          // bytes in a world's id (D2)
	maxReport  = 64          // bytes in a report's id
	maxText    = 40          // code points in a satellite's text (D7)
	startPrice = 1000000     // ugnot a day at deploy (D3)
	daysText   = "1, 3 or 7" // the days a rental lasts, as Rent checks them
)

// Strings, not structs: storage is billed per object (A1:801-804).
var (
	rentals  avl.Tree // world -> "payer start days price text", until the rental is closed (D2)
	payers   avl.Tree // payer -> its rentals' worlds, space-separated: three live at most
	held     int      // ugnot paid for rentals not closed, which a takedown may refund (D13)
	price    = startPrice
	paused   = true
	owner    address
	operator address
)

func init(cur realm) {
	owner = cur.Previous().Address()
}

// A rental, decoded from its string; never stored as a struct.
type rental struct {
	payer              address
	start, days, price int
	text               string
}

// encode is a rental as stored; the text, which may hold spaces, comes last.
func (r rental) encode() string {
	return r.payer.String() + " " + strconv.Itoa(r.start) + " " + strconv.Itoa(r.days) + " " + strconv.Itoa(r.price) + " " + r.text
}

func (r rental) end() int            { return r.start + r.days*day }
func (r rental) paid() int           { return r.days * r.price }
func (r rental) liveAt(now int) bool { return now < r.end() }

func clock() int { return int(time.Now().Unix()) }

func decode(v string) (r rental) {
	f := strings.SplitN(v, " ", 5)
	r.payer = address(f[0])
	r.start, _ = strconv.Atoi(f[1])
	r.days, _ = strconv.Atoi(f[2])
	r.price, _ = strconv.Atoi(f[3])
	r.text = f[4]
	return r
}

func get(world string) (rental, bool) {
	v := rentals.Get(world)
	if v == nil {
		return rental{}, false
	}
	return decode(v.(string)), true
}

// liveRental returns the world's rental if it has not ended: a world with no
// rental reads as one that ended at 0.
func liveRental(world string, now int) (rental, bool) {
	r, _ := get(world)
	return r, r.liveAt(now)
}

func worldsOf(payer address) []string {
	v := payers.Get(payer.String())
	if v == nil {
		return nil
	}
	return strings.Fields(v.(string))
}

func setWorlds(payer address, ws []string) {
	if len(ws) == 0 {
		payers.Remove(payer.String())
		return
	}
	payers.Set(payer.String(), strings.Join(ws, " "))
}

// Rent rents the world's satellite slot for days (1, 3 or 7) from now, showing
// text; the caller sends exactly the price times the days, in ugnot, from a
// wallet (a call, not a run). It closes the caller's ended rentals, and the
// world's if it has ended.
func Rent(cur realm, world, text string, days int) {
	if paused {
		panic("renting is paused")
	}
	if !cur.Previous().IsUserCall() {
		panic("rent from a wallet, not from code")
	}
	if !isSlug(world, maxWorld) {
		panic("not a world's id")
	}
	if days != 1 && days != 3 && days != longest {
		panic("days are " + daysText)
	}
	if !isText(text) {
		panic("not a satellite's text")
	}
	now := clock()
	if _, taken := liveRental(world, now); taken {
		panic("this world has a satellite")
	}
	payer := cur.Previous().Address()
	live, ended := countLive(payer, now)
	if live >= perPayer {
		panic("too many live satellites for this address")
	}
	cost := price * days
	mustPay(cost)

	for _, w := range ended {
		r, _ := get(w)
		closeEnded(w, r)
	}
	if r, ok := get(world); ok {
		closeEnded(world, r)
	}
	r := rental{payer: payer, start: now, days: days, price: price, text: text}
	rentals.Set(world, r.encode())
	setWorlds(payer, append(worldsOf(payer), world))
	held += cost
	chain.Emit("Rent", "world", world, "payer", payer.String(), "text", text, "days", strconv.Itoa(days),
		"price", strconv.Itoa(price), "end", strconv.Itoa(r.end()))
}

// countLive counts the payer's live rentals and lists its ended ones.
func countLive(payer address, now int) (live int, ended []string) {
	for _, w := range worldsOf(payer) {
		if _, ok := liveRental(w, now); ok {
			live++
		} else {
			ended = append(ended, w)
		}
	}
	return live, ended
}

// mustPay refuses a call that does not send exactly cost ugnot in one coin (D4).
func mustPay(cost int) {
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != denom || sent[0].Amount != int64(cost) {
		panic("send exactly " + strconv.Itoa(cost) + denom)
	}
}

// Close clears a world's ended rental, so storage holds live rentals only (D2).
// Anyone may close one.
func Close(cur realm, world string) {
	r, ok := get(world)
	if !ok {
		panic("no rental on this world")
	}
	if r.liveAt(clock()) {
		panic("this world's rental has not ended")
	}
	closeEnded(world, r)
}

func closeEnded(world string, r rental) {
	forget(world, r)
	chain.Emit("Close", "world", world, "payer", r.payer.String())
}

// forget deletes a rental: its payment leaves the held total, and the world and
// its payer's list no longer name it.
func forget(world string, r rental) {
	held -= r.paid()
	rentals.Remove(world)
	var rest []string
	for _, w := range worldsOf(r.payer) {
		if w != world {
			rest = append(rest, w)
		}
	}
	setWorlds(r.payer, rest)
}

// Takedown removes a live satellite after the report it answers, and refunds
// its payer the whole days not yet begun, at the price that rental paid; the
// day under way counts as begun (D12). The owner or the operator only.
func Takedown(cur realm, world, report string) {
	by := cur.Previous().Address()
	if by != owner && by != operator {
		panic("only the owner or the operator takes a satellite down")
	}
	if !isSlug(report, maxReport) {
		panic("not a report's id")
	}
	now := clock()
	r, ok := liveRental(world, now)
	if !ok {
		panic("no live satellite on this world")
	}
	refund := (r.days - (now-r.start)/day - 1) * r.price
	forget(world, r)
	banker.NewBanker(banker.BankerTypeRealmSend, cur).SendCoins(cur.Address(), r.payer, coins(refund))
	chain.Emit("Takedown", "world", world, "payer", r.payer.String(), "by", by.String(), "report", report,
		"refund", strconv.Itoa(refund))
}

func coins(n int) chain.Coins { return chain.Coins{{Denom: denom, Amount: int64(n)}} }

// Rental returns the world's live satellite: who paid, its text, and when it
// ends in unix seconds of block time. ok is false when the world has none.
func Rental(world string) (payer address, text string, end int, ok bool) {
	r, ok := liveRental(world, clock())
	if !ok {
		return "", "", 0, false
	}
	return r.payer, r.text, r.end(), true
}

// isSlug reports whether s is a slug of limit bytes at most: lowercase letters and
// digits in runs joined by single hyphens, as the app's world ids
// (packages/schemas/src/data.ts).
func isSlug(s string, limit int) bool {
	if s == "" || len(s) > limit || s[0] == '-' || s[len(s)-1] == '-' || strings.Contains(s, "--") {
		return false
	}
	for _, c := range s {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
			return false
		}
	}
	return true
}

// isText reports whether s is valid UTF-8 of at most maxText code points, one at
// least not a space, each printable (a letter, mark, number, punctuation, symbol
// or the ASCII space) and not default-ignorable: nothing that steers or hides what
// shows, as a bidi mark, a zero-width, a tag or a filler (D7, widened by the
// security review's S1 and S2). Code points, so the realm and the app count alike.
func isText(s string) bool {
	if !utf8.ValidString(s) {
		return false
	}
	n, shown := 0, false
	for _, c := range s {
		if !unicode.IsPrint(c) || unicode.Is(unicode.Other_Default_Ignorable_Code_Point, c) {
			return false
		}
		shown = shown || c != ' '
		n++
	}
	return shown && n <= maxText
}
