import { createServerFn } from "@tanstack/react-start";
import { buildLocalRecap, type ReconnectRecap } from "./reconnect.ts";

let lastCall = 0;

function parseRecap(raw: string, fallback: ReconnectRecap): ReconnectRecap {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const body = JSON.parse(match[0]) as Partial<ReconnectRecap>;
    const recap = typeof body.recap === "string" ? body.recap.trim() : "";
    const idea = typeof body.idea === "string" ? body.idea.trim() : "";
    const next = typeof body.next === "string" ? body.next.trim() : "";
    if (!recap || !idea) return fallback;
    return {
      recap: recap.slice(0, 320),
      idea: idea.slice(0, 160),
      next: (next || fallback.next).slice(0, 200),
      resumeAt: fallback.resumeAt,
    };
  } catch {
    return fallback;
  }
}

export const shapeRecap = createServerFn({ method: "POST" })
  .validator((input: { covered: string; next: string; progress: number; text: string }) => ({
    covered: String(input.covered ?? "").slice(0, 1200),
    next: String(input.next ?? "").slice(0, 500),
    progress: Number(input.progress) || 0,
    text: String(input.text ?? "").slice(0, 4000),
  }))
  .handler(async ({ data }): Promise<{ ok: true; recap: ReconnectRecap } | { ok: false; recap: ReconnectRecap }> => {
    const fallback = buildLocalRecap(data.text, data.progress);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey || !data.covered.trim()) return { ok: false, recap: fallback };

    const now = Date.now();
    if (now - lastCall < 3_000) return { ok: false, recap: fallback };
    lastCall = now;

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.3,
          max_tokens: 220,
          messages: [
            {
              role: "system",
              content:
                "You help a reader who lost the thread. Never say they are distracted, lazy, or failing. Write plain English. Reply with JSON only: {\"recap\":\"1-2 sentences of what they already passed\",\"idea\":\"one short main idea\",\"next\":\"one sentence of what comes now\"}.",
            },
            {
              role: "user",
              content: `Already passed:\n"""${data.covered}"""\n\nWhat comes next:\n"""${data.next}"""`,
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false, recap: fallback };
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? "";
      return { ok: true, recap: parseRecap(text, fallback) };
    } catch {
      return { ok: false, recap: fallback };
    }
  });
