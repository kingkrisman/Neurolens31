import { expect, test } from "@playwright/test";

/**
 * One line at a time.
 *
 * The mask's "no live line means no mask" rule used `:has()`, which made the
 * browser re-check every line of the chapter each time the band moved. It is
 * now a flag the reader sets. This pins what the reader sees either way: one
 * line at full strength, the rest quieter, and the flag in step with it.
 */

function fakeSession(id: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, role: "authenticated", aud: "authenticated", exp })}.unsigned`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "not-used",
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: `${id}@example.test`,
      app_metadata: { provider: "google" },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

const TEXT = Array.from(
  { length: 30 },
  (_, i) => `Sentence ${i + 1} of the passage sits on its own line of thought here.`,
).join(" ");

test("with the mask on, one line is at full strength and the rest are quieter", async ({
  page,
}) => {
  const id = "2b2b2b2b-1111-4111-8111-111111111111";
  await page.addInitScript(
    ([key, session, uid]) => {
      localStorage.setItem(key as string, JSON.stringify(session));
      localStorage.setItem(`neurolens-meta::${uid}`, JSON.stringify({ onboardedAt: Date.now() }));
      // Already answered the upload question, which otherwise opens over the
      // reader as soon as a book is — not what these tests are about.
      localStorage.setItem(`neurolens-upload-choice:${uid}`, "declined");
    },
    ["neurolens-auth", fakeSession(id), id],
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.evaluate(async (text) => {
    const url =
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/lib/store.ts")) ?? "/src/lib/store.ts";
    const { useAppStore } = await import(/* @vite-ignore */ url);
    const state = useAppStore.getState();
    state.setProfile({ ...state.profile, readingMask: true });
    useAppStore.getState().startReading(text, { title: "Passage", kind: "text" });
  }, TEXT);

  const reader = page.locator(".reader-scroll");
  await expect(reader).toHaveAttribute("data-band", "on", { timeout: 10_000 });
  await expect(page.locator(".reading-line.active")).toHaveCount(1);

  const colors = await page.evaluate(() => {
    const active = document.querySelector(".reading-line.active")!;
    const other = [...document.querySelectorAll(".reading-line")].find((el) => el !== active)!;
    return { active: getComputedStyle(active).color, other: getComputedStyle(other).color };
  });
  expect(colors.other).not.toBe(colors.active);
});
