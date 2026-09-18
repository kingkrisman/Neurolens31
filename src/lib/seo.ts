/**
 * One place that decides what a page says about itself.
 *
 * Every route had been inheriting the root's single title and description, so
 * search results, shared links and browser tabs all read "NeuroLens" no matter
 * where they pointed — and a search engine given eleven pages that describe
 * themselves identically has to guess which one answers a query, or treat them
 * as duplicates of each other.
 *
 * So each page states its own title, its own description, and its canonical
 * address. The rest — Open Graph, Twitter, the image, the locale — is derived
 * from those rather than repeated per route, because the failure mode of
 * hand-written social tags is that one of the four copies of the title drifts
 * and nobody notices for a year.
 */

/** Absolute origin, needed because canonical and og:url cannot be relative. */
const CONFIGURED_SITE_URL =
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SITE_URL : undefined) ?? "";

export const SITE = {
  name: "NeuroLens",
  /** Trailing slash trimmed so `${SITE.url}${path}` never doubles it. */
  url: CONFIGURED_SITE_URL.replace(/\/+$/, "") || "https://neurolens.app",
  locale: "en",
  /** 1200×630, the size both Facebook and X crop least badly. */
  ogImage: "/og.jpg",
  ogImageAlt: "NeuroLens — adaptive reading for ADHD, dyslexia and cognitive fatigue",
  description:
    "NeuroLens turns dense text into a calmer, more accessible read. Adaptive formatting, bionic fixation and a focus-friendly rhythm for ADHD, dyslexia and cognitive fatigue — free, and your library follows you to any device you read on.",
} as const;

export type SeoOptions = {
  /** Page title, without the site name — the suffix is added here. */
  title?: string;
  description?: string;
  /** Route path, e.g. "/help". Used for canonical and og:url. */
  path?: string;
  /** Absolute or root-relative image; defaults to the site card. */
  image?: string;
  imageAlt?: string;
  /** "website" for pages, "article" for dated documents. */
  type?: "website" | "article";
  /** Keep a page out of the index — sign-in, account, anything private. */
  noindex?: boolean;
  /** ISO date for article pages, so a result can show when it changed. */
  modified?: string;
};

function absolute(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Meta and links for a route's `head()`.
 *
 * Titles are capped at roughly what a result actually shows. A title Google
 * truncates is not a shorter title, it is a title with the end cut off, and the
 * end is usually where the distinguishing word was.
 */
export function seo({
  title,
  description = SITE.description,
  path = "/",
  image = SITE.ogImage,
  imageAlt = SITE.ogImageAlt,
  type = "website",
  noindex = false,
  modified,
}: SeoOptions = {}) {
  const fullTitle = title
    ? `${title} · ${SITE.name}`
    : `${SITE.name} — adaptive reading for busy minds`;
  const canonical = absolute(path);
  const imageUrl = absolute(image);

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },

    // Open Graph. `og:url` is the canonical address, not the one that was
    // shared — a link posted with tracking parameters should still collapse to
    // one page rather than counting as a new one.
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE.name },
    { property: "og:locale", content: "en_GB" },
    { property: "og:image", content: imageUrl },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: imageAlt },

    // Twitter reads og:* for most things, but not the card type, and without
    // the card type it renders a link rather than an image.
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: imageAlt },
  ];

  if (modified) meta.push({ property: "article:modified_time", content: modified });

  // `max-image-preview:large` is what allows a result to carry the card image;
  // without it Google shows a thumbnail or nothing at all.
  meta.push({
    name: "robots",
    content: noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  });

  return {
    meta,
    links: [{ rel: "canonical", href: canonical }],
  };
}

/** A JSON-LD block, ready for a route's `head().scripts`. */
export function jsonLd(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

/**
 * What the app is, in the vocabulary search engines actually parse.
 *
 * `WebApplication` rather than `SoftwareApplication`: it runs in a browser and
 * installs nothing, and the more specific type is the one that can be shown
 * with a price and a category. The price is stated because "free" is otherwise
 * not a fact any crawler can establish, and it is the single most useful thing
 * a result can say about this app.
 */
export function appJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Reading assistance",
    operatingSystem: "Any modern browser",
    browserRequirements: "Requires JavaScript and a browser released after 2021.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    featureList: [
      "Bionic fixation emphasis",
      "Adaptive formatting for dyslexia and ADHD",
      "Reading mask and word guide",
      "PDF, EPUB, DOCX, HTML, RTF, Markdown and plain text",
      "Highlights, notes and drawing",
      "Read-aloud with word tracking",
      "Works offline; files stay on the device",
    ],
    accessibilityFeature: [
      "highContrastDisplay",
      "largePrint",
      "readingOrder",
      "structuralNavigation",
      "alternativeText",
      "displayTransformability",
      "synchronizedAudioText",
    ],
    accessibilityHazard: ["noFlashingHazard", "noSoundHazard", "noMotionSimulationHazard"],
    accessibilityAPI: "ARIA",
    isAccessibleForFree: true,
    inLanguage: "en",
  };
}

/** The publisher behind the app, so the two can be told apart in a result. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: absolute("/favicon.svg"),
    description: SITE.description,
  };
}

/** The site itself — what carries a name into a sitelinks result. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
  };
}

/**
 * The trail above a page.
 *
 * Worth having on the document pages specifically: a result for "neurolens
 * privacy" showing NeuroLens › Privacy reads as a section of a site, where a
 * bare URL reads as a loose page.
 */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

/** Questions and answers, for the pages that are literally that. */
export function faqJsonLd(entries: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
