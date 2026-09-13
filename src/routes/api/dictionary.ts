import { createFileRoute } from "@tanstack/react-router";
import { proxyFetch } from "@/lib/proxy-fetch";

const DICTIONARY_ORIGIN = "https://api.dictionaryapi.dev";
const USER_AGENT = "NeuroLens/1.0 (adaptive reader; dictionary lookup)";

export const Route = createFileRoute("/api/dictionary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const incoming = new URL(request.url);
        const word = (incoming.searchParams.get("q") ?? "").toLowerCase().replace(/[^a-z']/g, "");
        if (word.length < 2 || word.length > 40) {
          return Response.json({ error: "Invalid word" }, { status: 400 });
        }

        try {
          const response = await proxyFetch(
            `${DICTIONARY_ORIGIN}/api/v2/entries/en/${encodeURIComponent(word)}`,
            {
              headers: {
                Accept: "application/json",
                "User-Agent": USER_AGENT,
              },
            },
            { timeoutMs: 6_000 },
          );
          const body = await response.arrayBuffer();
          const headers = new Headers();
          headers.set("content-type", response.headers.get("content-type") ?? "application/json");
          headers.set("cache-control", response.ok ? "public, max-age=86400" : "no-store");
          return new Response(body, { status: response.status, headers });
        } catch {
          return Response.json({ error: "Dictionary is unavailable." }, { status: 502 });
        }
      },
    },
  },
});
