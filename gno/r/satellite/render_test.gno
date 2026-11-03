package satellite

import (
	"chain"
	"strings"
	"testing"

	"gno.land/p/nt/markdown/sanitize/v0"
	"gno.land/p/nt/uassert/v0"
)

const head = "# Satellites\n\nEach world has one satellite slot, rented by the day.\n\nPrice: "

const howTo = "To rent one, call `Rent` with a world's id, a text of 1 to 40 characters and 1, 3 or 7 days, " +
	"sending exactly the price times the days, in ugnot.\n\n## Live satellites\n\n"

// open is the home page's top at the deploy price, renting open.
const open = head + "1000000 ugnot a day. Renting is open.\n\n" + howTo

const prev, next = "\n[Previous page](?page=", "\n[Next page](?page="

// line is a live satellite on the home page; its world and text are escaped once.
func line(world, text, until string) string {
	return "- **" + sanitize.InlineText(world) + "**: " + sanitize.InlineText(text) + ", until " + until + " UTC\n"
}

// plain is the home page's line of a world rented one day at t0 with the text
// "t" + its id: letters only, which need no escaping (sanitize is costly, and
// the mutation check runs every test once a mutant).
func plain(world string) string {
	return "- **" + world + "**: t" + world + ", until 2027-01-16 08:00 UTC\n"
}

func TestRenderHome(cur realm, t *testing.T) {
	fresh()
	uassert.Equal(t, open+"None on this page.\n", Render(""))

	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	pay(3 * p0)
	Rent(cross(cur), "az09-z", "**b** [x](javascript:alert(1)) <b>&amp;", 3)
	testing.SetRealm(testing.NewUserRealm(adm))
	SetPrice(cross(cur), 7)
	Pause(cross(cur))

	want := head + "7 ugnot a day. Renting is paused.\n\n" + howTo +
		line("az09-z", "**b** [x](javascript:alert(1)) <b>&amp;", "2027-01-18 08:00") +
		line("mars", "hello", "2027-01-16 08:00")
	uassert.Equal(t, want, Render(""))
	uassert.Equal(t, want, Render("?page=1"))
	uassert.False(t, strings.Contains(Render(""), "<b>"))
	uassert.False(t, strings.Contains(Render(""), "[x]("))
}

// An ended rental not yet closed is not shown.
func TestRenderShowsLiveSatellitesOnly(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", "hello", 1)
	pay(3 * p0)
	Rent(cross(cur), "venus", "hi", 3)
	at(t0 + oneDay - 1)
	uassert.Equal(t, open+line("mars", "hello", "2027-01-16 08:00")+line("venus", "hi", "2027-01-18 08:00"), Render(""))
	at(t0 + oneDay)
	uassert.Equal(t, open+line("venus", "hi", "2027-01-18 08:00"), Render(""))
	at(t0 + 3*oneDay)
	uassert.Equal(t, open+"None on this page.\n", Render(""))
}

func TestRenderWorld(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(3 * p0)
	Rent(cross(cur), "az09-z", "*hi* <i>", 3)
	want := "# Satellite over " + sanitize.InlineText("az09-z") + "\n\n" + sanitize.InlineText("*hi* <i>") +
		"\n\nUntil 2027-01-18 08:00 UTC, paid by " + alice.String() + ".\n"
	uassert.Equal(t, want, Render("az09-z"))
	at(t0 + 3*oneDay - 1)
	uassert.Equal(t, want, Render("az09-z"))
	at(t0 + 3*oneDay)
	uassert.Equal(t, "No satellite over this world.\n", Render("az09-z"))
	uassert.Equal(t, "No satellite over this world.\n", Render("venus"))

	// A world's id runs to forty bytes.
	long := strings.Repeat("ab-", 13) + "a"
	pay(p0)
	Rent(cross(cur), long, "hello", 1)
	uassert.True(t, strings.HasPrefix(Render(long), "# Satellite over "+sanitize.InlineText(long)+"\n\nhello\n\n"), Render(long))
}

// Bidi and zero-width characters are not control characters (D7), so a text
// may hold them; Render strips them. Built from code points: never raw in a source.
func TestRenderStripsBidi(cur realm, t *testing.T) {
	fresh()
	text := "ab" + string(rune(0x202e)) + "cd" + string(rune(0x200b)) + "ef" + string(rune(0x2066))
	testing.SetRealm(testing.NewUserRealm(alice))
	pay(p0)
	Rent(cross(cur), "mars", text, 1)
	_, got, _, _ := Rental("mars")
	uassert.Equal(t, text, got)
	uassert.True(t, strings.Contains(Render("mars"), "\n\nabcdef\n\n"), Render("mars"))
	uassert.True(t, strings.Contains(Render(""), "**: abcdef, until"), Render(""))
}

// Render's path comes from anyone: it is never echoed.
func TestRenderUnknownPathIsAFixedLine(t *testing.T) {
	fresh()
	for _, p := range []string{
		"<script>alert(1)</script>", "a\nb", "Mars", "mars/x", "mars?page=2", strings.Repeat("a", 41),
		"?page=", "?page=x", "?page=0", "?page=-1", "?page=2", "?page=1&x=2", "?Page=1", "page=1", "?page=99999999999999999999",
		"?page=+1", "?page=01", "?page=1 ", "?page= 1", // one spelling a page
	} {
		uassert.Equal(t, "No such page.\n", Render(p), p)
	}
}

// Ten rentals a page, in the worlds' order, the links after them: a page's
// edges at nine, ten and eleven rentals, then twenty and twenty-one.
func TestRenderPages(cur realm, t *testing.T) {
	fresh()
	ws := worlds(21)
	lines := make([]string, len(ws))
	for i, w := range ws {
		lines[i] = plain(w)
	}
	page := func(from, to int) string { return open + strings.Join(lines[from:to], "") }
	who := []address{alice, bob, carol, adm, mod, self, chain.PackageAddress("gno.land/r/test/dave")}
	for i, w := range ws {
		testing.SetRealm(testing.NewUserRealm(who[i/3]))
		pay(p0)
		Rent(cross(cur), w, "t"+w, 1)
		switch i + 1 {
		case 9:
			uassert.Equal(t, page(0, 9), Render(""))
			uassert.Equal(t, "No such page.\n", Render("?page=2"))
		case 10:
			uassert.Equal(t, page(0, 10), Render(""))
			uassert.Equal(t, open+"None on this page.\n"+prev+"1)\n", Render("?page=2"))
			uassert.Equal(t, "No such page.\n", Render("?page=3"))
		case 11:
			uassert.Equal(t, page(0, 10)+next+"2)\n", Render(""))
			uassert.Equal(t, page(10, 11)+prev+"1)\n", Render("?page=2"))
			uassert.Equal(t, "No such page.\n", Render("?page=10"))
		case 20: // the second page is the last, the third empty, the fourth none
			uassert.Equal(t, page(10, 20)+prev+"1)\n", Render("?page=2"))
			uassert.Equal(t, open+"None on this page.\n"+prev+"2)\n", Render("?page=3"))
			uassert.Equal(t, "No such page.\n", Render("?page=4"))
		case 21:
			uassert.Equal(t, page(0, 10)+next+"2)\n", Render("?page=1"))
			uassert.Equal(t, page(10, 20)+prev+"1)\n"+next+"3)\n", Render("?page=2"))
			uassert.Equal(t, page(20, 21)+prev+"2)\n", Render("?page=3"))
			uassert.Equal(t, "No such page.\n", Render("?page=4"))
		}
	}
}
