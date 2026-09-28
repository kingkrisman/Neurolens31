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
 * Kept on this device, never synced. A plant carries its book's title, and a
 * reader who chose "Keep them here" must not have their titles sent to the
 * account by way of a garden.
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
  const nums = (list: unknown) =>
    Array.isArray(list)
      ? [...new Set(list.filter((n): n is number => Number.isInteger(n) && n >= 0))]
      : [];
  const plantedAt = Number.isFinite(input.plantedAt) ? (input.plantedAt as number) : 0;
  return {
    id: input.id,
    title: typeof input.title === "string" ? input.title.slice(0, 120) : "",
    plantedAt,
    grewAt: Number.isFinite(input.grewAt) ? (input.grewAt as number) : plantedAt,
    chapters: nums(input.chapters),
    blooms: nums(input.blooms),
  };
}

export function normalizeGarden(value: unknown): Garden {
  if (!value || typeof value !== "object") return EMPTY_GARDEN;
  const plants = (value as { plants?: unknown }).plants;
  if (!Array.isArray(plants)) return EMPTY_GARDEN;
  return { plants: plants.map(normalizePlant).filter((p): p is GardenPlant => p !== null) };
}

type Growth = { id: string; title: string; section: number; at: number };

function grow(garden: Garden, growth: Growth, field: "chapters" | "blooms"): Garden {
  const existing = garden.plants.find((plant) => plant.id === growth.id);
  if (existing?.[field].includes(growth.section)) return garden;
  const plant: GardenPlant = existing
    ? {
        ...existing,
        title: growth.title || existing.title,
        grewAt: growth.at,
        [field]: [...existing[field], growth.section],
      }
    : {
        id: growth.id,
        title: growth.title,
        plantedAt: growth.at,
        grewAt: growth.at,
        chapters: field === "chapters" ? [growth.section] : [],
        blooms: field === "blooms" ? [growth.section] : [],
      };
  // A flower needs a plant to open on. Finishing a card for a chapter counts
  // that chapter as read too — the card is only offered at its end.
  if (field === "blooms" && !plant.chapters.includes(growth.section)) {
    plant.chapters = [...plant.chapters, growth.section];
  }
  const others = garden.plants.filter((p) => p.id !== growth.id);
  const plants = [...others, plant]
    .sort((a, b) => b.grewAt - a.grewAt)
    .slice(0, MAX_PLANTS)
    .sort((a, b) => a.plantedAt - b.plantedAt);
  return { plants };
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
