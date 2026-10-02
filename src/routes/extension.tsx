import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, BookOpenText, Check, Laptop, MessagesSquare, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";
import { DocSection, Glance, PublicLayout, Term } from "@/components/public-layout";
import {
  BROWSER_NAMES,
  STORE_LINKS,
  STORE_NAMES,
  guessBrowser,
  storeLinkFor,
  useExtensionInstalled,
  type BrowserGuess,
  type BrowserId,
} from "@/lib/extension";
import { breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/extension")({
  head: () => ({
    ...seo({
      title: "Browser extension",
      description:
        "Read any website with your NeuroLens settings: your typeface, spacing, colours, bold word starts and reading mask, on the sites you choose. For Chrome, Edge and Firefox.",
      path: "/extension",
    }),
    scripts: [
      jsonLd(
        breadcrumbJsonLd([
          { name: "NeuroLens", path: "/" },
          { name: "Browser extension", path: "/extension" },
        ]),
      ),
    ],
  }),
  component: ExtensionPage,
});

const TOC = [
  { id: "get-it", label: "Get it" },
  { id: "what", label: "What it does" },
  { id: "how", label: "How to use it" },
  { id: "private", label: "Privacy" },
  { id: "questions", label: "Questions" },
];

const ORDER: BrowserId[] = ["chrome", "edge", "firefox"];

function ExtensionPage() {
  return (
    <PublicLayout
      eyebrow="Browser extension"
      title="Read every site your way."
      lead="Your NeuroLens settings, on the websites you choose — news, blogs, Wikipedia, and the posts in your social feeds. Or send any article straight to the reader."
      toc={TOC}
    >
      <section id="get-it" className="scroll-mt-28">
        <InstallCard />
      </section>

      <DocSection id="what" title="What it does">
        <Glance
          items={[
            {
              icon: ToggleRight,
              title: "Your settings, site by site",
              body: "Switch it on for a site and its text takes your typeface, size, spacing, bold word starts, colours and reading mask. Menus and buttons stay as they were.",
            },
            {
              icon: BookOpenText,
              title: "Read this page in NeuroLens",
              body: "One click takes the article — or just the part you selected — into the reader, without the adverts and menus around it.",
            },
            {
              icon: MessagesSquare,
              title: "Social posts too",
              body: "Posts on X, Bluesky, Facebook, Instagram, Threads, Reddit, LinkedIn and YouTube comments are treated as reading text.",
            },
            {
              icon: Laptop,
              title: "No second sign-in",
              body: "Open NeuroLens once in the same browser and your settings come across. Change one in the app and every site follows.",
            },
          ]}
        />
      </DocSection>

      <DocSection id="how" title="How to use it">
        <ol>
          <li>Add the extension from your browser's store, using the button above.</li>
          <li>
            Open <Link to="/">NeuroLens</Link> in the same browser, signed in. Your settings come across
            on their own.
          </li>
          <li>
            On any site, click the NeuroLens icon in your toolbar and turn on{" "}
            <Term>Use my settings on</Term>. The browser asks once to allow that site.
          </li>
          <li>
            Pick what to change: <Term>Typeface and size</Term>, <Term>Spacing</Term>,{" "}
            <Term>Bold word starts</Term>, <Term>Colours</Term> and, if you use it,{" "}
            <Term>Reading mask</Term>. Turn the site off again and the page is exactly as it was.
          </li>
          <li>
            On an article, <Term>Read this page in NeuroLens</Term> opens it in the reader instead.
          </li>
        </ol>
      </DocSection>

      <DocSection id="private" title="Privacy">
        <p>
          The extension only touches the sites you switch on, and gives up its access when you switch
          them off. Your settings stay in that browser. Nothing about the pages you visit is sent
          anywhere, and it has no analytics. The full detail is in the{" "}
          <Link to="/privacy" hash="extension">
            privacy policy
          </Link>
          .
        </p>
      </DocSection>

      <DocSection id="questions" title="Questions">
        <p>
          <Term>Which browsers?</Term> Chrome, Edge and Firefox on a computer. Brave, Vivaldi and other
          browsers built on Chrome install from the Chrome Web Store. Safari is not supported yet, and
          phone browsers do not take extensions like this one.
        </p>
        <p>
          <Term>Does it cost anything?</Term> No. It is free, like NeuroLens.
        </p>
        <p>
          <Term>A site looks wrong.</Term> Untick the part that is causing it in the popup, or switch
          that site off — it goes back to exactly how it was. Then{" "}
          <Link to="/support">tell us which site</Link>, so it can be fixed.
        </p>
        <p>
          <Term>Dark sites and light colours.</Term> A site that is already dark keeps its own colours
          under a light palette such as Cream; turning photo-heavy dark sites light washes them out. The
          typeface, spacing, bold word starts and mask still apply.
        </p>
      </DocSection>
    </PublicLayout>
  );
}

/**
 * The button that matters, for the browser in front of us.
 *
 * Worked out after the page loads, never on the server: the server cannot
 * know the browser, and guessing there would flash the wrong button.
 */
function InstallCard() {
  const installed = useExtensionInstalled();
  const [guess, setGuess] = useState<BrowserGuess | null>(null);
  useEffect(() => setGuess(guessBrowser(navigator.userAgent)), []);

  const published = ORDER.filter((id) => STORE_LINKS[id]);
  const mine = guess ? storeLinkFor(guess) : null;
  const others = published.filter((id) => id !== guess?.browser);

  let title: string;
  let body: string;
  if (installed) {
    title = "Installed in this browser";
    body = "Click the NeuroLens icon in your toolbar on any site to switch your settings on there.";
  } else if (guess?.mobile) {
    title = "Made for computers";
    body = "Phone and tablet browsers do not take extensions like this. Open neurolens.space/extension on your laptop or desktop.";
  } else if (!published.length) {
    title = "Coming soon to your browser's store";
    body = "The extension is on its way to the Chrome Web Store, Edge Add-ons and Firefox Add-ons. The button to add it will be here the day it is listed.";
  } else if (mine && guess?.browser) {
    title = `Free for ${BROWSER_NAMES[guess.browser]}`;
    body = `Adds from the ${STORE_NAMES[guess.browser]} in a click. Remove it the same way, any time.`;
  } else {
    title = "For Chrome, Edge and Firefox";
    body = "This browser does not take the extension yet. It works in any of these.";
  }

  return (
    <div className="rounded-2xl bg-surface p-6 shadow-border sm:p-7">
      <div className="flex items-start gap-3">
        {installed ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/12 text-success">
            <Check size={16} aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-[-0.01em] text-fg">{title}</p>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-pretty text-muted">{body}</p>
        </div>
      </div>

      {!installed && !guess?.mobile && published.length ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          {mine && guess?.browser ? (
            <a
              href={mine}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
            >
              Add to {BROWSER_NAMES[guess.browser]}
              <ArrowUpRight size={15} aria-hidden />
            </a>
          ) : null}
          {(mine ? others : published).map((id) => (
            <a
              key={id}
              href={STORE_LINKS[id]!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg"
            >
              {mine ? `Also for ${BROWSER_NAMES[id]}` : `Get it for ${BROWSER_NAMES[id]}`}
              <ArrowUpRight size={13} aria-hidden />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
