import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SmoothScroll } from "@/components/smooth-scroll";
import { WebVitals } from "@/components/web-vitals";
import { SyncProvider } from "@/components/sync-provider";
import { CrashReporter } from "@/components/crash-reporter";
import { jsonLd, organizationJsonLd, seo, websiteJsonLd } from "@/lib/seo";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => {
    // Meta only. The canonical link is deliberately left to each route: the
    // root's would be emitted on every page as well as the page's own, and two
    // conflicting canonicals are worse than none — a crawler discards both and
    // picks a URL itself.
    const { meta } = seo();
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        ...meta,

        // Two colours, so the browser chrome follows the page rather than
        // sitting a shade off it in whichever mode the reader is in.
        { name: "theme-color", content: "#F0E8DC", media: "(prefers-color-scheme: light)" },
        { name: "theme-color", content: "#14120F", media: "(prefers-color-scheme: dark)" },

        { name: "application-name", content: "NeuroLens" },
        { name: "apple-mobile-web-app-title", content: "NeuroLens" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "format-detection", content: "telephone=no" },

        // Said once, at the root: this is a reading aid, and the audience is
        // the thing most people are searching by name for.
        {
          name: "author",
          content: "NeuroLens",
        },
      ],
      links: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "stylesheet", href: appCss },
        { rel: "preload", as: "image", href: "/images/hero-lens.jpg", fetchPriority: "high" },
        // Was pointing at a file that does not exist, so every install prompt
        // and every crawler asking for the manifest got a 404.
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      ],
      // Site-level identity, stated once. The app itself is described on the
      // page that is actually the app, not here.
      scripts: [jsonLd(organizationJsonLd()), jsonLd(websiteJsonLd())],
    };
  },
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var p=JSON.parse(localStorage.getItem("neurolens-profile")||"{}");if(p&&p.theme)document.documentElement.dataset.scheme=p.theme;if(localStorage.getItem("neurolens-started"))document.documentElement.dataset.started="1"}catch(e){}',
          }}
        />
        <PreviewHostBridge />
        <SmoothScroll />
        <WebVitals />
        <CrashReporter />
        <SyncProvider />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
