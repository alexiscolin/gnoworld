package satellite

import (
	"strconv"
	"strings"
	"time"

	"gno.land/p/nt/markdown/sanitize/v0"
)

const (
	pageSize = 10 // the number of rentals that one home page reads; it shows only the live ones
	noPage   = "No such page.\n"
	noWorld  = "No satellite over this world.\n"
)

// Render serves "" and "?page=n" (the price, how to rent, and the live
// satellites), and a world's id (that world's live satellite). Anyone can choose
// the path, so any other path gets a fixed line that never repeats the path,
// and every text is escaped.
func Render(path string) string {
	if path == "" {
		return home(1)
	}
	if p, found := strings.CutPrefix(path, "?page="); found {
		n, _ := strconv.Atoi(p)
		if strconv.Itoa(n) != p || n < 1 || n > 1 && n > pages() {
			return noPage
		}
		return home(n)
	}
	if isSlug(path, maxWorld) {
		return worldPage(path)
	}
	return noPage
}

// home is page n of the rentals, in the worlds' order. An ended rental that is not
// closed yet keeps its place on the page but is not shown.
func home(n int) string {
	var b strings.Builder
	b.WriteString("# Satellites\n\nEach world has one satellite slot, rented by the day.\n\nPrice: " + strconv.Itoa(price) + " ugnot a day. ")
	if paused {
		b.WriteString("Renting is paused.\n\n")
	} else {
		b.WriteString("Renting is open.\n\n")
	}
	b.WriteString("To rent one, call `Rent` with a world's id, a text of 1 to " + strconv.Itoa(maxText) +
		" characters and " + daysText + " days, sending exactly the price times the days, in ugnot.\n\n## Live satellites\n\n")
	now, shown := clock(), 0
	rentals.IterateByOffset((n-1)*pageSize, pageSize, func(world string, v any) bool {
		if r := decode(v.(string)); r.liveAt(now) {
			b.WriteString("- **" + sanitize.InlineText(world) + "**: " + sanitize.InlineText(r.text) + ", until " + date(r.end()) + "\n")
			shown++
		}
		return false
	})
	if shown == 0 {
		b.WriteString("None on this page.\n")
	}
	if n > 1 {
		b.WriteString("\n[Previous page](?page=" + strconv.Itoa(n-1) + ")\n")
	}
	if n < pages() {
		b.WriteString("\n[Next page](?page=" + strconv.Itoa(n+1) + ")\n")
	}
	return b.String()
}

// pages is how many home pages the rentals fill. The first page exists even when there are no rentals.
func pages() int {
	return (rentals.Size() + pageSize - 1) / pageSize
}

func worldPage(world string) string {
	r, ok := liveRental(world, clock())
	if !ok {
		return noWorld
	}
	return "# Satellite over " + sanitize.InlineText(world) + "\n\n" + sanitize.InlineText(r.text) +
		"\n\nUntil " + date(r.end()) + ", paid by " + r.payer.String() + ".\n"
}

// date writes unix seconds in UTC, to the minute.
func date(sec int) string {
	return time.UnixMilli(int64(sec)*1000).UTC().Format("2006-01-02 15:04") + " UTC"
}
