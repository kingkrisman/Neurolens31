import { seedOf } from "./recall.ts";

/**
 * The reading garden.
 *
 * Every book is a plant. Finishing a chapter helps it grow; finishing a recall
 * card opens a flower on it. That is the whole mechanic, and what it leaves
 * out is the point: there is no streak to break, nothing wilts, a missed day
 * changes nothing, and nothing is compared with anyone. Testers already said
 * what pressure does to these readers — a watching face made them feel
 * watched — and a streak that resets is a small punishment for having a life.
 * This only ever grows.
 *
 * Kept on this device, and followed to the reader's other devices only for
 * books that are already in their account. What travels is the account's own
 * id for the book, the chapters and the flowers — never the title, which each
 * device already has from the book itself. A book kept on this device keeps
 * its plant here too: a garden must not be the way a title the reader chose to
 * keep reaches the account. See `syncedGarden` and `mergeSynced`.
 */

export interface GardenPlant {
  /** Stable per book. */
  id: string;
  title: string;
  plantedAt: number;
  /** Most recent growth, for ordering the garden. */
  grewAt: number;
  /** Sections finished — each counts once, however often it is re-read. */
  chapters: number[];
  /** Sections whose recall card was finished — one flower each. */
  blooms: number[];
  /**
   * The account's id for this plant's book, once the book is in the account.
   *
   * What a plant is matched by across devices. The local id comes from the
   * book's text, which a device that has only listed the book does not have.
   */
  book?: string;
}

export interface Garden {
  plants: GardenPlant[];
}

export const EMPTY_GARDEN: Garden = { plants: [] };

/** More than a garden needs; the oldest untouched plants make way. */
const MAX_PLANTS = 48;

export function plantIdFor(bookKey: string): string {
  return seedOf(bookKey).toString(36);
}

export type Species = 0 | 1 | 2 | 3;
export const SPECIES_NAMES = ["daisy", "tulip", "bellflower", "sunflower"] as const;

/** Which kind of plant a book grows into — the same one every time. */
export function speciesOf(id: string): Species {
  return (seedOf(`species:${id}`) % 4) as Species;
}

/**
 * How grown a plant is, 1 to 4.
 *
 * Front-loaded: the first chapter makes a sprout and the second a proper
 * plant, because early growth is when a reward does most. After that it takes
 * more to change, so a long book still has somewhere to go.
 */
export function stageOf(plant: GardenPlant): 1 | 2 | 3 | 4 {
  const n = plant.chapters.length;
  if (n >= 8) return 4;
  if (n >= 4) return 3;
  if (n >= 2) return 2;
  return 1;
}

function normalizePlant(value: unknown): GardenPlant | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<GardenPlant>;
  if (typeof input.id !== "string" || !input.id) return null;
  const plantedAt = Number.isFinite(input.plantedAt) ? (input.plantedAt as number) : 0;
  const plant: GardenPlant = {
    id: input.id,
    title: typeof input.title === "string" ? input.title.slice(0, 120) : "",
    plantedAt,
    grewAt: Number.isFinite(input.grewAt) ? (input.grewAt as number) : plantedAt,
    chapters: nums(input.chapters),
    blooms: nums(input.blooms),
  };
  if (typeof input.book === "string" && input.book) plant.book = input.book;
  return plant;
}

const nums = (list: unknown): number[] =>
  Array.isArray(list)
    ? [...new Set(list.filter((n): n is number => Number.isInteger(n) && n >= 0))]
    : [];

export function normalizeGarden(value: unknown): Garden {
  if (!value || typeof value !== "object") return EMPTY_GARDEN;
  const plants = (value as { plants?: unknown }).plants;
  if (!Array.isArray(plants)) return EMPTY_GARDEN;
  return { plants: plants.map(normalizePlant).filter((p): p is GardenPlant => p !== null) };
}

type Growth = {
  id: string;
  title: string;
  section: number;
  at: number;
  /** The account's id for the book, when it has one. */
  book?: string | null;
};

/** Newest growth keeps its place; the oldest untouched plants make way. */
function tidy(plants: GardenPlant[]): Garden {
  return {
    plants: [...plants]
      .sort((a, b) => b.grewAt - a.grewAt)
      .slice(0, MAX_PLANTS)
      .sort((a, b) => a.plantedAt - b.plantedAt),
  };
}

function grow(garden: Garden, growth: Growth, field: "chapters" | "blooms"): Garden {
  // By the account's id first: a plant that arrived from another device before
  // this one had the book's text is filed under that id, not the text's.
  const existing =
    (growth.book ? garden.plants.find((plant) => plant.book === growth.book) : undefined) ??
    garden.plants.find((plant) => plant.id === growth.id);
  const learnsBook = Boolean(growth.book && existing && existing.book !== growth.book);
  if (existing?.[field].includes(growth.section) && !learnsBook) return garden;
  const plant: GardenPlant = existing
    ? {
        ...existing,
        title: growth.title || existing.title,
        grewAt: existing[field].includes(growth.section) ? existing.grewAt : growth.at,
        [field]: existing[field].includes(growth.section)
          ? existing[field]
          : [...existing[field], growth.section],
      }
    : {
        id: growth.id,
        title: growth.title,
        plantedAt: growth.at,
        grewAt: growth.at,
        chapters: field === "chapters" ? [growth.section] : [],
        blooms: field === "blooms" ? [growth.section] : [],
      };
  if (growth.book) plant.book = growth.book;
  // A flower needs a plant to open on. Finishing a card for a chapter counts
  // that chapter as read too — the card is only offered at its end.
  if (field === "blooms" && !plant.chapters.includes(growth.section)) {
    plant.chapters = [...plant.chapters, growth.section];
  }
  return tidy([...garden.plants.filter((p) => p.id !== plant.id), plant]);
}

export function withChapterFinished(garden: Garden, growth: Growth): Garden {
  return grow(garden, growth, "chapters");
}

export function withBloom(garden: Garden, growth: Growth): Garden {
  return grow(garden, growth, "blooms");
}

/** What changed, in a sentence — or null when nothing did. */
export function describeGrowth(before: Garden, after: Garden, id: string): string | null {
  const was = before.plants.find((p) => p.id === id);
  const now = after.plants.find((p) => p.id === id);
  if (!now) return null;
  const name = now.title || "this book";
  if (!was) return `A new sprout for ${name} in your garden.`;
  if (now.blooms.length > was.blooms.length) return `A flower opened on ${name}.`;
  if (stageOf(now) > stageOf(was)) return `${name} grew in your garden.`;
  return null;
}

/* ── Across devices ──────────────────────────────────────────────────────── */

/**
 * A plant as the account keeps it: which book, by the account's own id, and
 * how it has grown. No title, and no local id — both belong to the device.
 */
export interface SyncedPlant {
  book: string;
  plantedAt: number;
  grewAt: number;
  chapters: number[];
  blooms: number[];
}

/**
 * The plants to send, and only those.
 *
 * `bookOf` says which account book a plant belongs to, or null for a book that
 * is not in the account — and a plant without one is not sent, whatever else is
 * true of it.
 */
export function syncedGarden(
  garden: Garden,
  bookOf: (plant: GardenPlant) => string | null,
): SyncedPlant[] {
  const out: SyncedPlant[] = [];
  for (const plant of garden.plants) {
    const book = plant.book ?? bookOf(plant);
    if (!book) continue;
    out.push({
      book,
      plantedAt: plant.plantedAt,
      grewAt: plant.grewAt,
      chapters: [...plant.chapters].sort((a, b) => a - b),
      blooms: [...plant.blooms].sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => (a.book < b.book ? -1 : a.book > b.book ? 1 : 0));
}

export function normalizeSynced(value: unknown): SyncedPlant[] {
  if (!Array.isArray(value)) return [];
  const out: SyncedPlant[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_PLANTS * 2)) {
    if (!item || typeof item !== "object") continue;
    const input = item as Partial<SyncedPlant>;
    if (typeof input.book !== "string" || !input.book || seen.has(input.book)) continue;
    seen.add(input.book);
    const plantedAt = Number.isFinite(input.plantedAt) ? (input.plantedAt as number) : 0;
    out.push({
      book: input.book,
      plantedAt,
      grewAt: Number.isFinite(input.grewAt) ? (input.grewAt as number) : plantedAt,
      chapters: nums(input.chapters),
      blooms: nums(input.blooms),
    });
  }
  return out;
}

const union = (a: number[], b: number[]) => [...new Set([...a, ...b])];

/**
 * Fold the account's plants into this device's garden.
 *
 * Growth only ever adds — the union of chapters and flowers, the earliest
 * planting, the latest growth — so two devices can never undo each other.
 * `place` says where a book lives on this device (the local plant id and
 * title), or null for a book this device does not list, which is skipped.
 * Returns the same garden when nothing changed.
 */
export function mergeSynced(
  garden: Garden,
  incoming: SyncedPlant[],
  place: (book: string) => { id: string; title: string } | null,
): Garden {
  let plants = garden.plants;
  let changed = false;
  for (const theirs of incoming) {
    const placed = place(theirs.book);
    const ours =
      plants.find((plant) => plant.book === theirs.book) ??
      (placed ? plants.find((plant) => plant.id === placed.id) : undefined);
    if (!ours && !placed) continue;
    const next: GardenPlant = ours
      ? {
          ...ours,
          book: theirs.book,
          title: ours.title || placed?.title || "",
          plantedAt: Math.min(ours.plantedAt || theirs.plantedAt, theirs.plantedAt || ours.plantedAt),
          grewAt: Math.max(ours.grewAt, theirs.grewAt),
          chapters: union(ours.chapters, theirs.chapters),
          blooms: union(ours.blooms, theirs.blooms),
        }
      : {
          id: placed!.id,
          title: placed!.title,
          book: theirs.book,
          plantedAt: theirs.plantedAt,
          grewAt: theirs.grewAt,
          chapters: [...theirs.chapters],
          blooms: [...theirs.blooms],
        };
    if (ours && JSON.stringify(ours) === JSON.stringify(next)) continue;
    changed = true;
    plants = [...plants.filter((plant) => plant !== ours), next];
  }
  return changed ? tidy(plants) : garden;
}

/** Whether this device's plants hold anything the account's copy does not. */
export function knowsMore(local: SyncedPlant[], remote: SyncedPlant[]): boolean {
  const theirs = new Map(remote.map((plant) => [plant.book, plant]));
  return local.some((plant) => {
    const other = theirs.get(plant.book);
    if (!other) return true;
    return (
      plant.chapters.some((n) => !other.chapters.includes(n)) ||
      plant.blooms.some((n) => !other.blooms.includes(n)) ||
      plant.grewAt > other.grewAt
    );
  });
}
