import { expect, test, type Page } from "@playwright/test";

/**
 * A new account is asked the survey.
 *
 * This exists because the survey shipped wired to nothing. `OnboardingGate`
 * was imported into the home route and never placed in the JSX — the component
 * was correct, its tests passed, the questions rendered perfectly in isolation,
 * and no new account ever saw it. Typecheck is happy with an unused import and
 * lint says "defined but never used", which was one warning among two dozen
 * pre-existing ones and read as noise.
 *
 * Nothing short of loading the real route as a signed-in reader would have
 * caught it, so that is what this does.
 */

/** A session supabase-js accepts from storage, so no network is involved. */
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
      user_metadata: { name: "Test Reader" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

/** Sign in as somebody who has never used this device. */
async function signInFresh(page: Page, id: string) {
  await page.addInitScript(
    ([key, session]) => {
      try {
        localStorage.setItem(key as string, JSON.stringify(session));
      } catch {
        /* blocked storage — the test will fail on the assertion, not here */
      }
    },
    ["neurolens-auth", fakeSession(id)],
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The gate waits for hydration and for a sync to settle or time out.
  await page.waitForTimeout(4000);
}

test("a new account is asked the survey on first sign-in", async ({ page }) => {
  await signInFresh(page, "11111111-1111-4111-8111-111111111111");
  // Up to the gate's designed worst case. It waits for the account's own
  // answer before asking, so a returning reader on a new device is not asked
  // again — and here the account is a placeholder host that fails slowly.
  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeVisible({
    timeout: 12_000,
  });
});

test("the app behind the survey is inert, not merely covered", async ({ page }) => {
  await signInFresh(page, "22222222-2222-4222-8222-222222222222");
  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeVisible({
    timeout: 12_000,
  });

  // Covering is paint. Without `inert` the whole shell stays tabbable and in
  // the accessibility tree underneath, and the page has two h1s.
  await expect(page.locator("[inert]")).toHaveCount(1);

  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Tab");
    const inSurvey = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return true;
      return Boolean(el.closest("[inert]")) === false;
    });
    expect(inSurvey, "focus left the survey for the page behind it").toBe(true);
  }
});

test("answering it applies the settings and it does not come back", async ({ page }) => {
  await signInFresh(page, "33333333-3333-4333-8333-333333333333");

  await page.getByRole("button", { name: /Study material/ }).click();
  await page.getByRole("button", { name: /I lose my place/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /^Larger$/ }).click();
  await page.getByRole("button", { name: /Cool grey/ }).click();
  await page.getByRole("button", { name: /Steadily/ }).click();

  // Nothing is saved until the preview is accepted.
  await expect(page.getByRole("heading", { name: "Here is how that reads." })).toBeVisible();
  await page.getByRole("button", { name: /Use these settings/ }).click();

  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeHidden();

  const profile = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("neurolens-profile::"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>) : null;
  });
  expect(profile, "the profile should be saved under the account's own key").not.toBeNull();
  expect(profile!.readingMask, "‘I lose my place’ should turn the mask on").toBe(true);
  expect(profile!.theme, "‘Cool grey’ should set the palette").toBe("mist");
  const meta = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("neurolens-meta::"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>) : null;
  });
  expect(meta?.onboardedAt, "answering should record that we asked, on meta").toBeTruthy();
  expect(profile!.onboardedAt, "and not on the profile, which gets replaced").toBeUndefined();

  // The whole point of the flag: asked once, not once per visit.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeHidden();
});

test("skipping also counts as asked", async ({ page }) => {
  await signInFresh(page, "44444444-4444-4444-8444-444444444444");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeHidden();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await expect(
    page.getByRole("heading", { name: "What do you mostly read?" }),
    "re-asking somebody who declined is worse than never asking",
  ).toBeHidden();
});

test("the avatar is saved to the account, not the device", async ({ page }) => {
  // It used to live under a device-wide localStorage key that the sync layer
  // did not know about: two accounts on one machine shared a face, and a
  // choice made here never reached anywhere else.
  await signInFresh(page, "55555555-5555-4555-8555-555555555555");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForTimeout(500);

  await page.goto("/account", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const picked = page.getByRole("button", { name: /Shuffle|Doodle|Big smile/ }).first();
  await expect(picked).toBeVisible();
  await picked.click();
  await page.waitForTimeout(800);

  const stored = await page.evaluate(() => {
    const scoped = Object.keys(localStorage).find((k) => k.startsWith("neurolens-meta::"));
    const meta = scoped ? JSON.parse(localStorage.getItem(scoped)!) : null;
    return {
      onAccountProfile: Boolean(meta?.avatar),
      style: meta?.avatar?.style ?? null,
      // The old device-wide key must not be what carries the choice any more.
      deviceWideKeyWritten: localStorage.getItem("neurolens-avatar") !== null,
    };
  });

  expect(stored.onAccountProfile, "the avatar should be on the account's meta").toBe(true);
  expect(stored.style).toBeTruthy();
  expect(stored.deviceWideKeyWritten, "nothing should still write the device-wide key").toBe(false);
});

test("changing mode after the survey does not bring it back", async ({ page }) => {
  // The bug as it was reported: answered, then the survey reappeared on every
  // refresh. `setMode` rebuilds the profile from a preset, and while the flag
  // lived on the profile that rebuild erased it. The earlier version of this
  // file answered and reloaded but never changed mode, so it passed while the
  // real thing was broken.
  await signInFresh(page, "66666666-6666-4666-8666-666666666666");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeHidden();

  // Change mode the way a reader would, then refresh twice.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/lib/store.ts");
    for (const mode of ["dyslexia", "adhd", "focus", "default"]) {
      useAppStore.getState().setMode(mode as never);
    }
  });

  for (let i = 0; i < 2; i += 1) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await expect(
      page.getByRole("heading", { name: "What do you mostly read?" }),
      `survey came back after mode changes and reload ${i + 1}`,
    ).toBeHidden();
  }
});

test("a sync pull without the flag does not erase it", async ({ page }) => {
  // The second way it was lost: every pull replaced the local profile with
  // the server's, and the server's copy had not caught up.
  await signInFresh(page, "77777777-7777-4777-8777-777777777777");
  await page.getByRole("button", { name: "Skip" }).click();

  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/lib/store.ts");
    // What a pull delivers for an account whose server row predates the flag.
    useAppStore.getState().applyAccountData({
      sessions: [],
      highlights: {},
      ink: {},
      bookmarks: [],
      settings: { profile: { fontSize: 30 } as never, meta: {} },
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await expect(page.getByRole("heading", { name: "What do you mostly read?" })).toBeHidden();
});
