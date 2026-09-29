# NeuroLens browser extension

Two things, both only when the reader asks:

- **Use my settings here.** A switch per site. On a switched-on site, reading
  text gets the reader's typeface and size, spacing, bold word starts and
  colour palette. Menus, headers, buttons and code keep the site's own look.
  Switching off puts the page back exactly as it was, without a reload.
- **Read this page in NeuroLens.** Takes the article from the open tab (or the
  part the reader selected), and opens it in the app's reader.

The settings come from the app itself. With the extension installed, opening
NeuroLens hands them over through the page. There is no second sign-in, and
no server is involved. Changing a setting in the app updates every
switched-on site straight away.

Chrome, Edge and Firefox (desktop). Safari needs a separate Xcode wrapper
and a paid Apple developer account, so it is left for later.

## Build

```sh
npm run build:extension             # store build + zips, talks to neurolens.space
node scripts/build-extension.mjs --dev   # talks to the app on localhost:8080
```

| Folder | What it is |
| --- | --- |
| `dist/store/chrome`, `dist/store/firefox` | The store build, unpacked |
| `dist/neurolens-chrome-1.0.0.zip` | Upload to the Chrome Web Store and to Edge Add-ons |
| `dist/neurolens-firefox-1.0.0.zip` | Upload to addons.mozilla.org |
| `dist/dev/…` | Load this one while working on it locally |
| `dist/test/…` | What `tests/extension.spec.ts` loads (never ship it: it has 127.0.0.1 access built in) |

## Try it locally

**Chrome or Edge:** open `chrome://extensions` (or `edge://extensions`), turn on
Developer mode, choose **Load unpacked**, and pick `extension/dist/dev/chrome`.

**Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load
Temporary Add-on**, and pick `extension/dist/dev/firefox/manifest.json`.

Then open the app at `http://localhost:8080` once, signed in, so the settings
come across. Visit any article and click the NeuroLens icon.

## Publish

| Store | Cost | Notes |
| --- | --- | --- |
| Chrome Web Store | $5 once | Review usually takes a few days. Every permission needs a one-line reason (below). |
| Microsoft Edge Add-ons | Free | Takes the same zip as Chrome. |
| Firefox (addons.mozilla.org) | Free | Upload the Firefox zip. Reviewers may ask for the source: send the repo, with `npm ci && npm run build:extension` as the build command. `npx web-ext lint` reports 0 errors. Its 2 warnings are `innerHTML` inside Mozilla's own Readability library (`extract.js`), which works on a detached copy of the page. |
| Safari | $99/year | Later. Needs `xcrun safari-web-extension-converter` and a Mac. |

Permission reasons, for the store forms:

- `storage`: keeps the reader's settings and their list of sites, in this browser only.
- `activeTab` and `scripting`: act on the open tab only when the reader clicks the extension.
- Optional site access: asked for one site at a time, when the reader switches that site on,
  and given back when they switch it off.
- `neurolens.space`: where the app hands over the reader's settings.

Single purpose, for the Chrome form: *"Lets people read any website with the reading
settings they chose in NeuroLens."*

Data use: nothing is collected or sent. The privacy policy section is at
`/privacy#extension`.

## How it fits together

| File | Runs | Does |
| --- | --- | --- |
| `src/bridge.ts` | On neurolens.space only | Receives the settings from the app (`src/lib/extension-bridge.ts`), hands over pages to read |
| `src/content.ts` | On switched-on sites | Applies the look and undoes it; fonts arrive as bytes from the background, so no site policy can block them |
| `src/extract.ts` | In the open tab, on request | Mozilla Readability, the engine behind Firefox Reader View |
| `src/background.ts` | Always | Registers the restyle script for exactly the sites that are on and permitted; serves font files |
| `src/popup.*` | The toolbar popup | The switch, the options, the Read button |
| `src/restyle.ts` | Pure functions | The stylesheet, the palette maths, the bold word starts (the app's own `processBionicText`) |

Colours work without touching the site's CSS: one fixed layer over the page,
mixed so the page's background becomes the palette's and text keeps its
contrast. When a dark palette meets a light site, or the other way round, the
page is turned first (`invert` + `hue-rotate`, with pictures turned back). The
layer's colour is chosen to come out of the turn as the palette. The maths is
in `tintFor`, and `restyle.test.ts` checks every palette on light and dark sites.

The palettes and typefaces are copies of the app's. `palettes.test.ts` reads
`src/styles.css` and `src/lib/types.ts` and fails if they drift apart.

## Tests

- `npm test` runs the unit tests here along with the app's.
- `npx playwright test tests/extension.spec.ts` loads the real extension into
  Chromium. It checks restyling and undoing, the popup (with an axe audit), the
  settings handoff from the app, and "Read this page" landing in the reader.
