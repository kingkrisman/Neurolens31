import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests, for the things only a browser can answer.
 *
 * The unit suite covers the logic. What it cannot cover is whether the rendered
 * page is usable: contrast, heading order, whether a control has a name a
 * screen reader can read out. Those are properties of the DOM after it has been
 * styled, and the only honest way to check them is to render it.
 *
 * Deliberately small. This is not a second copy of the unit tests — it is the
 * accessibility audit, run automatically, because an app built for dyslexic and
 * low-vision readers cannot treat that as something to check by hand and then
 * forget.
 */
export default defineConfig({
  testDir: "tests",
  // Accessibility failures are not flaky. A retry would only hide a real one.
  retries: 0,
  // One worker: the dev server it drives is a single Vite process, and parallel
  // page loads make the timings noisy without making the suite faster.
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080",
    // On failure only — a trace per passing test is hundreds of megabytes of
    // artefacts nobody opens.
    trace: "retain-on-failure",
    /**
     * Every browser test runs with reduced motion asked for.
     *
     * Not a convenience. Scroll-reveal animations mean most of a long page is
     * at opacity 0 until an observer fires, and auditing that measures the
     * contrast of text against itself — 83 "failures" at a ratio of 1.01, all
     * of them text that is simply not shown yet. Reduced motion is also a real
     * configuration that real readers use, and the one this app exists to serve
     * well, so it is the right thing to be testing.
     */
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /**
   * Starts the app unless something is already serving it.
   *
   * `reuseExistingServer` matters locally: a developer with `npm run dev`
   * already open should not have a second one fight it for port 8080.
   */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
        env: {
          /**
           * Placeholders when nothing real is configured.
           *
           * The onboarding tests sign in by seeding a session into storage, so
           * they never call Supabase — but the app refuses to render past
           * `AuthGate` when the keys are *absent*, showing "not configured"
           * instead. Non-empty values are all that is needed, which means these
           * suites run on a machine and in a CI job with no secrets at all.
           * A real value in the environment still wins.
           */
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
          // Shaped like a real anon key, because `scripts/check-env.mjs`
          // rightly warns that a twenty-character one is truncated, and a
          // warning that fires on every test run is a warning people stop
          // reading. Not a real key and not a real project.
          VITE_SUPABASE_ANON_KEY:
            process.env.VITE_SUPABASE_ANON_KEY ||
            `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${"placeholder".repeat(16)}.not-a-real-key`,
        },
      },
});
