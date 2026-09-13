export type Testament = "OT" | "NT";

export interface BibleBook {
  name: string;
  testament: Testament;
  chapters: number;
}

export interface ReadingPlan {
  id: string;
  name: string;
  description: string;
  chapters: string[];
}

export interface FeaturedPassage {
  id: string;
  book: string;
  chapter: number;
  verse?: string;
  label: string;
}

function b(name: string, testament: Testament, chapters: number): BibleBook {
  return { name, testament, chapters };
}

/** World English Bible — public domain, fetched live from bible-api.com. */
export const BIBLE_ATTRIBUTION =
  "World English Bible (WEB), public domain, via bible-api.com. Type a reference like John 3:16, or open a chapter.";

export const BIBLE_BOOKS: BibleBook[] = [
  b("Genesis", "OT", 50),
  b("Exodus", "OT", 40),
  b("Leviticus", "OT", 27),
  b("Numbers", "OT", 36),
  b("Deuteronomy", "OT", 34),
  b("Joshua", "OT", 24),
  b("Judges", "OT", 21),
  b("Ruth", "OT", 4),
  b("1 Samuel", "OT", 31),
  b("2 Samuel", "OT", 24),
  b("1 Kings", "OT", 22),
  b("2 Kings", "OT", 25),
  b("1 Chronicles", "OT", 29),
  b("2 Chronicles", "OT", 36),
  b("Ezra", "OT", 10),
  b("Nehemiah", "OT", 13),
  b("Esther", "OT", 10),
  b("Job", "OT", 42),
  b("Psalms", "OT", 150),
  b("Proverbs", "OT", 31),
  b("Ecclesiastes", "OT", 12),
  b("Song of Solomon", "OT", 8),
  b("Isaiah", "OT", 66),
  b("Jeremiah", "OT", 52),
  b("Lamentations", "OT", 5),
  b("Ezekiel", "OT", 48),
  b("Daniel", "OT", 12),
  b("Hosea", "OT", 14),
  b("Joel", "OT", 3),
  b("Amos", "OT", 9),
  b("Obadiah", "OT", 1),
  b("Jonah", "OT", 4),
  b("Micah", "OT", 7),
  b("Nahum", "OT", 3),
  b("Habakkuk", "OT", 3),
  b("Zephaniah", "OT", 3),
  b("Haggai", "OT", 2),
  b("Zechariah", "OT", 14),
  b("Malachi", "OT", 4),
  b("Matthew", "NT", 28),
  b("Mark", "NT", 16),
  b("Luke", "NT", 24),
  b("John", "NT", 21),
  b("Acts", "NT", 28),
  b("Romans", "NT", 16),
  b("1 Corinthians", "NT", 16),
  b("2 Corinthians", "NT", 13),
  b("Galatians", "NT", 6),
  b("Ephesians", "NT", 6),
  b("Philippians", "NT", 4),
  b("Colossians", "NT", 4),
  b("1 Thessalonians", "NT", 5),
  b("2 Thessalonians", "NT", 3),
  b("1 Timothy", "NT", 6),
  b("2 Timothy", "NT", 4),
  b("Titus", "NT", 3),
  b("Philemon", "NT", 1),
  b("Hebrews", "NT", 13),
  b("James", "NT", 5),
  b("1 Peter", "NT", 5),
  b("2 Peter", "NT", 3),
  b("1 John", "NT", 5),
  b("2 John", "NT", 1),
  b("3 John", "NT", 1),
  b("Jude", "NT", 1),
  b("Revelation", "NT", 22),
];

export const FEATURED_PASSAGES: FeaturedPassage[] = [
  { id: "genesis-1", book: "Genesis", chapter: 1, label: "Genesis 1" },
  { id: "psalm-23", book: "Psalms", chapter: 23, label: "Psalm 23" },
  { id: "proverbs-3", book: "Proverbs", chapter: 3, label: "Proverbs 3" },
  { id: "isaiah-40", book: "Isaiah", chapter: 40, verse: "28-31", label: "Isaiah 40:28–31" },
  { id: "matthew-5", book: "Matthew", chapter: 5, label: "Matthew 5" },
  { id: "john-1", book: "John", chapter: 1, label: "John 1" },
  { id: "john-3-16", book: "John", chapter: 3, verse: "16", label: "John 3:16" },
  { id: "romans-8", book: "Romans", chapter: 8, label: "Romans 8" },
];

export const BIBLE_PLANS: ReadingPlan[] = [
  {
    id: "gospels",
    name: "Gospels",
    description: "The Word, new birth, and the mountain teaching.",
    chapters: ["john-1", "john-3-16", "matthew-5"],
  },
  {
    id: "psalms",
    name: "Psalms",
    description: "A shepherd’s rest for a quieter page.",
    chapters: ["psalm-23"],
  },
  {
    id: "beginnings",
    name: "Beginnings",
    description: "Creation, wisdom, and a still water.",
    chapters: ["genesis-1", "proverbs-3", "psalm-23"],
  },
];

export function findPassage(id: string): FeaturedPassage | undefined {
  return FEATURED_PASSAGES.find((item) => item.id === id);
}
