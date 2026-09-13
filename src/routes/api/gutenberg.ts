import { createFileRoute } from "@tanstack/react-router";
import { isAllowedGutenbergUrl } from "@/lib/gutendex";
import { proxyFetch } from "@/lib/proxy-fetch";

const USER_AGENT = "NeuroLens/1.0 (adaptive reader; Project Gutenberg text)";

export const Route = createFileRoute("/api/gutenberg")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!isAllowedGutenbergUrl(target)) {
          return new Response("Not found", { status: 404 });
        }

        try {
          const response = await proxyFetch(
            target as string,
            {
              headers: {
                Accept: "text/plain, text/html;q=0.8, image/*;q=0.5, */*;q=0.1",
                "User-Agent": USER_AGENT,
              },
              redirect: "follow",
            },
            { timeoutMs: 20_000 },
          );
          const body = await response.arrayBuffer();
          const headers = new Headers();
          headers.set("content-type", response.headers.get("content-type") ?? "text/plain; charset=utf-8");
          headers.set("cache-control", response.ok ? "public, max-age=86400" : "no-store");
          return new Response(body, { status: response.status, headers });
        } catch {
          return Response.json({ error: "Project Gutenberg is unavailable." }, { status: 502 });
        }
      },
    },
  },
});
