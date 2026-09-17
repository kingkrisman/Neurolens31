import { Link, createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/whats-new")({
  head: () => ({
    ...seo({
      title: "What's new",
      description:
        "Recent changes to NeuroLens: new reading tools, accessibility fixes, and what is being worked on next.",
      path: "/whats-new",
    }),
    scripts: [
      jsonLd(
        breadcrumbJsonLd([
          { name: "NeuroLens", path: "/" },
          { name: "What's new", path: "/whats-new" },
        ]),
      ),
    ],
  }),
  component: WhatsNew,
});

type Release = {
  date: string;
  title: string;
  items: Array<{ what: string; why?: string }>;
};

/**
 * What changed, newest first.
 *
 * Written for readers, not for the people who wrote the code — so each entry
 * says what is different when you next open the app, and the ones worth
 * explaining say why. Fixes are included rather than hidden under "various
 * improvements": someone who hit a bug wants to know it was theirs that got
 * fixed, and a changelog that only lists features reads like marketing.
 */
const RELEASES: Release[] = [
  {
    date: "14 September 2026",
    title: "Accounts, help, and a place to tell us things",
    items: [
      {
        what: "Sign in with Google — no password.",
        why: "A password is one more thing to remember and one more thing to lose. Your books, marks and reading profile follow you between devices.",
      },
      { what: "An account page that downloads everything you have, or erases it." },
      {
        what: "A help page covering every tool, and a support page that gathers the technical details for you.",
      },
      { what: "Terms and an accessibility statement, both written to actually be read." },
    ],
  },
  {
    date: "13 September 2026",
    title: "More kinds of book",
    items: [
      {
        what: "EPUB, Word, HTML, RTF and Markdown now open alongside PDF.",
        why: "EPUB in particular reflows properly, so it suits this reader better than a PDF ever will.",
      },
      {
        what: "An unfamiliar file is tried as text instead of refused.",
        why: "Most things are prose under a name nobody listed.",
      },
      {
        what: "One unreadable page no longer loses the whole book.",
        why: "A page that will not parse is left blank and counted, and you are told how many.",
      },
      {
        what: "Long PDFs count their pages while they load, so a slow file no longer looks like a broken one.",
      },
      { what: "PDFs now open on older phones, which previously failed on every page." },
    ],
  },
  {
    date: "12 September 2026",
    title: "Marking and drawing",
    items: [
      {
        what: "Six highlighter colours.",
        why: "One colour makes every mark mean the same thing. Six lets you sort as you read — the point, the doubt, the thing to look up.",
      },
      {
        what: "Draw on the page: pen, marker, pencil and eraser.",
        why: "Circling a paragraph says something a wash of colour cannot. A stylus draws straight away; your finger still scrolls.",
      },
      {
        what: "Drawings follow the text when you change type size.",
        why: "The page reflows, so ink is pinned to the line it was drawn on rather than to the screen.",
      },
      { what: "Highlights carry their colour into the list, where you can change your mind." },
    ],
  },
  {
    date: "11 September 2026",
    title: "Reading a PDF, not looking at one",
    items: [
      {
        what: "PDF pages show reformatted text instead of a picture of the page.",
        why: "The original page was being drawn on top of the very text extracted from it — which is the layout this reader exists to replace.",
      },
      { what: "Any length of PDF opens; the old two-hundred-page limit is gone." },
      {
        what: "Words no longer break apart mid-word, and headings no longer run into the paragraph beneath them.",
      },
    ],
  },
];

function WhatsNew() {
  return (
    <PublicLayout
      eyebrow="What's new"
      title="What changed, and why."
      image="/images/feature-books.jpg"
      imageAlt="A shelf of well-used books"
    >
      <p>
        Newest first. If something you relied on has moved,{" "}
        <Link to="/support" className="text-fg underline underline-offset-2">
          say so
        </Link>{" "}
        — that is worth knowing.
      </p>

      {RELEASES.map((release) => (
        <section key={release.date} className="doc-section">
          <p className="doc-eyebrow">{release.date}</p>
          <h2 className="doc-h2 mt-2">{release.title}</h2>
          <ul className="mt-6 space-y-3">
            {release.items.map((item) => (
              <li key={item.what} className="rounded-2xl bg-surface p-5 shadow-border">
                <p className="text-[15px] leading-relaxed font-medium text-fg">{item.what}</p>
                {item.why ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.why}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="border-t border-fg/10 pt-6 text-subtle">
        Dates are when a change reached the app. Older entries are trimmed once they stop being
        useful to anyone still catching up.
      </p>
    </PublicLayout>
  );
}
