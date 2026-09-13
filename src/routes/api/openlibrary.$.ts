import { createFileRoute } from "@tanstack/react-router";
import { proxyFetch } from "@/lib/proxy-fetch";

const OPEN_LIBRARY_ORIGIN = "https://openlibrary.org";
const USER_AGENT = "NeuroLens/1.0 (adaptive reader)";

function isAllowedSplat(splat: string): boolean {
  if (splat === "search.json") return true;
  return /^works\/OL\d+W\.json$/.test(splat);
}

export const Route = createFileRoute("/api/openlibrary/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const splat = params._splat ?? "";
        if (!isAllowedSplat(splat)) {
          return new Response("Not found", { status: 404 });
        }

        const incoming = new URL(request.url);
        const target = new URL(`${OPEN_LIBRARY_ORIGIN}/${splat}`);
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
            { timeoutMs: 8_000 },
          );
          const body = await response.arrayBuffer();
          const headers = new Headers();
          headers.set("content-type", response.headers.get("content-type") ?? "application/json");
          headers.set("cache-control", response.ok ? "public, max-age=120" : "no-store");
          return new Response(body, { status: response.status, headers });
        } catch {
          return Response.json({ error: "Open Library is unavailable." }, { status: 502 });
        }
      },
    },
  },
});
