// The data's events and news for the code that comes after the first screen (the bell, the calendar). They come as text and are read
// here, so these chunks share no module with the home's own import of the files, which would split them out of its first screen (slice 8:
// some 570 B). Checked with their schemas, as the build checked the files.
import { Events, News } from "@gnoworld/schemas";
import eventsText from "../data/events.json?raw";
import newsText from "../data/news.json?raw";

export const events = Events.parse(JSON.parse(eventsText));
export const news = News.parse(JSON.parse(newsText));
