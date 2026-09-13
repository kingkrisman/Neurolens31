import { createFileRoute } from "@tanstack/react-router";
import { proxyFetch } from "@/lib/proxy-fetch";

const GUTENDEX_ORIGIN = "https://gutendex.com";
const USER_AGENT = "NeuroLens/1.0 (adaptive reader; Project Gutenberg via Gutendex)";

function isAllowedSplat(splat: string): boolean {
  return splat === "books" || /^books\/\d+$/.test(splat);
}

export const Route = createFileRoute("/api/gutendex/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const splat = params._splat ?? "";
        if (!isAllowedSplat(splat)) {
          return new Response("Not found", { status: 404 });
        }

        const incoming = new URL(request.url);
        const target = new URL(`${GUTENDEX_ORIGIN}/${splat}`);
        incoming.searchParams.forEach((value, key) => {
          target.searchParams.set(key, value);
        });

        try {
          const response = await proxyFetch(
            target,
            {
              headers: {
                Accept: "application/json",
                "User-Agent": USER_AGENT,
              },
            },
            { timeoutMs: 3_000 },
          );
          const body = await response.arrayBuffer();
          const out = new Headers();
          out.set("content-type", response.headers.get("content-type") ?? "application/json");
          out.set("cache-control", response.ok ? "public, max-age=180" : "no-store");
          return new Response(body, { status: response.status, headers: out });
        } catch {
          return Response.json({ error: "Gutendex is unavailable." }, { status: 502 });
        }
      },
    },
  },
});
